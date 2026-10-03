package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.OfflineJobEntity
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlin.time.Clock
import kotlin.uuid.Uuid

internal data class OfflineDownloadRequest(val id: String, val workId: Long, val url: String, val capture: OfflineCaptureRequest, val automatic: Boolean = false)
internal data class DownloadDebugEntry(val timestamp: String, val message: String)

class OfflineCoordinator internal constructor(
    internal val store: OfflineContentStore,
    private val accounts: AccountDataStore,
    private val settings: AppSettings,
    internal val gate: Ao3RequestGate,
    internal val network: StateFlow<OfflineNetwork>,
    val enabled: Boolean,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main),
    private val requestSync: () -> Unit = {}
) {
    private val workStates = MutableStateFlow<List<OfflineWorkStatus>>(emptyList())
    internal val downloads = workStates.asStateFlow()
    private val storageState = MutableStateFlow(OfflineStorageUsage())
    internal val storageUsage = storageState.asStateFlow()
    private val backgroundRequest = MutableStateFlow<OfflineDownloadRequest?>(null)
    internal val background = backgroundRequest.asStateFlow()
    private val foregroundRequest = MutableStateFlow<OfflineCaptureRequest?>(null)
    internal val capture = foregroundRequest.asStateFlow()
    private val statusMessage = MutableStateFlow<String?>(null)
    val message = statusMessage.asStateFlow()
    private val observation = MutableStateFlow<OfflinePageObservation?>(null)
    internal val page = observation.asStateFlow()
    private val foreground = MutableStateFlow(false)
    internal val isForeground = foreground.asStateFlow()
    private val serviceActive = MutableStateFlow(false)
    private val debugState = MutableStateFlow<List<DownloadDebugEntry>>(emptyList())
    internal val debugEntries = debugState.asStateFlow()
    private val queueActive = MutableStateFlow(false)
    internal val hasPendingDownloads = queueActive.asStateFlow()
    private var automaticPage: OfflinePage? = null
    private val liveNavigation = MutableStateFlow(0L)
    private val captureId = MutableStateFlow<String?>(null)
    private var automaticCapture = false
    private var liveUrl: String? = null
    private var foregroundTask: Job? = null
    private var downloadTask: Job? = null
    private val downloadId = MutableStateFlow<String?>(null)
    private var pendingSave: Pair<Long, Boolean>? = null
    private val wake = Channel<Unit>(Channel.CONFLATED)

    init {
        if (enabled) {
            scope.launch {
                accounts.observe { it.workDao().getAllWorks() }
                    .map { works -> works.associate { it.id to (it.currentChapters to it.downloadUpdatedAt) } }.distinctUntilChanged().collect {
                        try { refresh(); replanPrefetch() } catch (error: CancellationException) { throw error } catch (_: Exception) {
                            statusMessage.value = "Download coverage could not be refreshed. Reopen Downloads to try again."
                        }
                    }
            }
            scope.launch {
                combine(foreground, network, settings.autoSyncOnOpenEnabled) { active, connection, autoSync ->
                    active && connection.connected && autoSync
                }.distinctUntilChanged().collectLatest { connected ->
                    if (connected) {
                        val generation = accounts.generation
                        delay(1000)
                        if (accounts.generation == generation) requestSync()
                    }
                }
            }
            scope.launch {
                combine(accounts.accountGeneration, accounts.offlineReset) { generation, reset -> generation to reset }
                    .collect {
                        downloadTask?.cancel()
                        cancelCapture()
                        observation.value = null
                        workStates.value = emptyList()
                        pendingSave = null
                        automaticPage = null
                        debugState.value = emptyList()
                        try {
                            store.initialize()
                            refresh()
                            store.collectUnusedFiles()
                            kick()
                        } catch (_: CancellationException) { } catch (_: Exception) {
                            statusMessage.value = "Saved works could not be loaded. Try reopening the app."
                        }
                    }
            }
            scope.launch {
                network.collect {
                    if (!it.connected || backgroundRequest.value?.automatic == true && !prefetchAllowed()) downloadTask?.cancel()
                    runCatching { refreshQueueAvailability() }
                    kick()
                }
            }
            scope.launch {
                combine(settings.incognitoModeEnabled, settings.offlinePreferences) { _, _ -> Unit }.collect {
                    if (!automaticAllowed() && automaticCapture) cancelCapture()
                    if (!prefetchAllowed() && backgroundRequest.value?.automatic == true) downloadTask?.cancel()
                    try { replanPrefetch() } catch (_: CancellationException) { } catch (_: Exception) {
                        debug("Unable to update the prefetch queue. Reopen a chapter to retry.")
                    }
                    runCatching { refreshQueueAvailability() }
                    kick()
                }
            }
            scope.launch {
                settings.offlinePreferences.map { it.autoDeleteRead }.distinctUntilChanged().collectLatest { enabled ->
                    if (!enabled) return@collectLatest
                    combine(accounts.observe { it.chapterDao().observeReadChapters() }, store.context) { _, context -> context }.collect { context ->
                        if (context != null && store.isCurrent(context)) try {
                            store.removeReadChapters(context) { settings.offlinePreferences.value.autoDeleteRead }
                            refresh()
                        } catch (_: CancellationException) { } catch (_: Exception) {
                            debug("Automatic cleanup failed; saved copies were retained where possible.")
                        }
                    }
                }
            }
            scope.launch {
                for (signal in wake) {
                    while (canDownload()) {
                        val context = store.context.value ?: break
                        val job = try { store.nextJob(context, prefetchAllowed()) } catch (_: CancellationException) { null } catch (_: Exception) {
                            statusMessage.value = "The download queue could not be loaded. Try reopening the app."
                            null
                        }
                        if (job == null) {
                            val retryAt = try { store.nextRetryAt(context, prefetchAllowed()) } catch (_: Exception) { null } ?: break
                            delay((retryAt - Clock.System.now().toEpochMilliseconds()).coerceIn(1, 1000))
                            continue
                        }
                        var queueFailed = false
                        val task = scope.launch {
                            try { runDownload(context, job) } catch (error: CancellationException) { throw error } catch (_: Exception) {
                                queueFailed = true
                                statusMessage.value = "The download was interrupted. Reopen the app to resume."
                            }
                        }
                        downloadTask = task
                        task.join()
                        if (downloadTask === task) downloadTask = null
                        if (queueFailed) break
                        if (canDownload()) delay(1500)
                    }
                }
            }
        }
    }

    internal fun setForeground(active: Boolean) {
        foreground.value = active
        if (!active) {
            if (!serviceActive.value) downloadTask?.cancel()
            cancelCapture()
        }
        kick()
    }

    internal fun setDownloadServiceActive(active: Boolean) {
        serviceActive.value = active
        if (!active) { downloadId.value = null; downloadTask?.cancel() }
        debug(if (active) "Background download service started." else "Background download service stopped; unfinished chapters remain queued.")
        kick()
    }

    internal fun debug(message: String) {
        debugState.update { (it + DownloadDebugEntry(Clock.System.now().toString(), message)).takeLast(100) }
    }

    private suspend fun replanPrefetch() {
        val page = automaticPage ?: return
        val context = store.context.value?.takeIf(store::isCurrent) ?: return
        if (!automaticAllowed()) return
        if (backgroundRequest.value?.automatic == true) {
            downloadId.value = null
            downloadTask?.cancel()
            downloadTask?.join()
        }
        store.enqueuePrefetch(context, page, refreshCurrent = true, preferences = settings.offlinePreferences.value) { automaticAllowed() }
        refresh()
        kick()
    }

    internal fun interactiveLoading(loading: Boolean) {
        gate.setInteractiveLoading(loading)
        if (loading) { downloadId.value = null; downloadTask?.cancel() } else kick()
    }

    internal fun liveNavigation(url: String) {
        if (url.substringBefore('#') == liveUrl?.substringBefore('#')) return
        liveUrl = url
        liveNavigation.value++
        store.releaseReaderProtection()
        observation.value = null
        cancelCapture()
    }

    internal fun observed(event: OfflinePageObservation) {
        if (!enabled || event.url.substringBefore('#') != liveUrl?.substringBefore('#')) return
        val version = liveNavigation.value
        scope.launch {
            try {
                if (event.identity != null && event.identity != store.context.value?.identity) {
                    workStates.value = emptyList()
                    automaticPage = null
                    debugState.value = emptyList()
                }
                event.identity?.let { store.observeIdentity(it) { liveNavigation.value == version } }
                if (liveNavigation.value != version) return@launch
                observation.value = event
                refresh()
                val pending = pendingSave
                if (pending != null && event.readable && event.identity != null &&
                    runCatching { offlineLocation(event.url).workId.toLong() == pending.first }.getOrDefault(false)) {
                    pendingSave = null
                    captureCurrent(pending.first, pending.second)
                } else if (event.readable && event.identity != null && automaticAllowed() && foreground.value && captureId.value == null) {
                    captureCurrent(offlineLocation(event.url).workId.toLong(), false, automatic = true)
                }
                kick()
            } catch (_: CancellationException) { } catch (_: Exception) {
                statusMessage.value = "Unable to identify this AO3 session. Reload the page before saving."
            }
        }
    }

    internal fun saveWork(workId: Long, update: Boolean = false) {
        if (!enabled) return
        val current = observation.value
        if (current?.readable == true && runCatching { offlineLocation(current.url).workId.toLong() == workId }.getOrDefault(false)) {
            captureCurrent(workId, update)
        } else launchAction {
            val context = store.context.value?.takeIf(store::isCurrent)
            if (context == null) {
                pendingSave = workId to update
                statusMessage.value = "The work will be saved after AO3 confirms access."
                NavigationState.navigateToRead("https://archiveofourown.org/works/$workId?view_full_work=false")
                return@launchAction
            }
            downloadTask?.cancel()
            store.enqueueWork(context, workId, update)
            debug(if (update) "Queued saved-work update." else "Queued whole-work download.")
            refresh()
            kick()
        }
    }

    private fun captureCurrent(workId: Long, update: Boolean, automatic: Boolean = false) {
        cancelCapture()
        downloadTask?.cancel()
        val observed = observation.value ?: return
        val context = store.context.value?.takeIf(store::isCurrent) ?: return
        val version = liveNavigation.value
        val tracking = settings.captureTrackingSession()
        if (automatic && (tracking == null || !automaticAllowed())) return
        val id = Uuid.random().toString()
        captureId.value = id
        automaticCapture = automatic
        foregroundTask = scope.launch {
            val allowed = { captureId.value == id && liveNavigation.value == version && store.isCurrent(context) &&
                (!automatic || tracking != null && settings.isTrackingSessionCurrent(tracking) && automaticAllowed()) }
            var staged: OfflineContentStore.Capture? = null
            val result = CompletableDeferred<Unit>()
            try {
                if (!automatic) {
                    store.enqueueWork(context, workId, update)
                    refresh()
                }
                val capture = store.beginCapture(context, allowed)
                staged = capture
                foregroundRequest.value = OfflineCaptureRequest(observed.url, context.identity, allowed,
                    capture::stage, publish = {
                        capture.publish(it, foreground = true, pin = !automatic, automatic = automatic, deleteRead = settings.offlinePreferences.value.autoDeleteRead)
                        automaticPage = it.page
                        if (automatic) store.enqueuePrefetch(context, it.page, preferences = settings.offlinePreferences.value, isAllowed = allowed) else store.enqueueWork(context, workId, update)
                        debug("Saved current chapter. Download revision: ${it.page.downloadUpdatedAt ?: "unknown"}.")
                        result.complete(Unit)
                    }, onFailure = { message, retryAfter ->
                        if (retryAfter != null) gate.pause(retryAfter)
                        result.completeExceptionally(IllegalStateException(message))
                    }, onProgress = ::debug)
                withTimeout(300_000) { result.await() }
                if (!automatic) statusMessage.value = if (offlineLocation(observed.url).representation == "whole")
                    "Saved the site skin. Individual chapters are queued for offline reading."
                    else "Saved this chapter. The remaining chapters are queued."
                refresh()
            } catch (_: TimeoutCancellationException) {
                statusMessage.value = "Saving timed out. Your previous saved copy is unchanged."
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                statusMessage.value = error.message ?: "Unable to save this chapter."
            } finally {
                withContext(NonCancellable) { staged?.cancel(); runCatching { store.collectUnusedFiles() } }
                if (captureId.value == id) { captureId.value = null; foregroundRequest.value = null }
                kick()
            }
        }
    }

    private fun cancelCapture() {
        captureId.value = null
        foregroundRequest.value = null
        foregroundTask?.cancel()
        foregroundTask = null
    }

    private fun canDownload(): Boolean = enabled && (foreground.value || serviceActive.value) && network.value.connected && captureId.value == null
    private fun automaticAllowed(): Boolean = settings.offlinePreferences.value.automatic && !settings.incognitoModeEnabled.value
    private fun prefetchAllowed(): Boolean = automaticAllowed() && (!settings.offlinePreferences.value.wifiOnly || network.value.wifi)
    private fun kick() { wake.trySend(Unit) }

    private suspend fun runDownload(context: OfflineContext, job: OfflineJobEntity) {
        var staged: OfflineContentStore.Capture? = null
        val id = Uuid.random().toString()
        val automatic = job.mode == "prefetch"
        val tracking = settings.captureTrackingSession()
        try {
            gate.background {
                if (!canDownload() || !store.isCurrent(context) || automatic && !prefetchAllowed()) return@background
                val url = offlineJson.decodeFromString<List<String>>(job.remainingJson).firstOrNull() ?: return@background
                store.setJobState(context, job.id, "running")
                debug("Starting ${job.mode} chapter download.")
                downloadId.value = id
                val allowed = { downloadId.value == id && canDownload() && store.isCurrent(context) &&
                    (!automatic || tracking != null && settings.isTrackingSessionCurrent(tracking) && prefetchAllowed()) }
                val result = CompletableDeferred<Unit>()
                val capture = store.beginCapture(context, allowed)
                staged = capture
                val request = OfflineCaptureRequest(url, context.identity, allowed, capture::stage,
                    publish = {
                        capture.publish(it, foreground = false, pin = !automatic, jobId = job.id, automatic = automatic, deleteRead = settings.offlinePreferences.value.autoDeleteRead)
                        debug("Chapter saved. Download revision: ${it.page.downloadUpdatedAt ?: "unknown"}.")
                        result.complete(Unit)
                    },
                    onFailure = { message, retryAfter ->
                        if (retryAfter != null) gate.pause(retryAfter)
                        result.completeExceptionally(IllegalStateException(message))
                    }, onProgress = ::debug)
                backgroundRequest.value = OfflineDownloadRequest(id, job.workId, url, request, automatic)
                refresh()
                withTimeout(300_000) { result.await() }
            }
        } catch (_: TimeoutCancellationException) {
            debug("Download timed out after five minutes.")
            if (store.isCurrent(context)) store.failJob(context, job.id, "AO3 did not respond. Open the work or retry.", gate.cooldown.value)
        } catch (error: CancellationException) {
            debug("Download paused; the unfinished chapter will be retried.")
            withContext(NonCancellable) {
                if (store.isCurrent(context)) store.setJobState(context, job.id, "queued")
            }
            throw error
        } catch (error: Exception) {
            debug("Download failed: ${error.message ?: error::class.simpleName}")
            if (store.isCurrent(context)) {
                val message = error.message?.takeIf { it.contains("space", true) || it.contains("allowance", true) }
                    ?: "Unable to save this chapter. Open it in Read, then retry."
                if (message.contains("space", true) || message.contains("allowance", true)) store.setJobState(context, job.id, "failed", message)
                else store.failJob(context, job.id, message, gate.cooldown.value)
            }
        } finally {
            if (downloadId.value == id) downloadId.value = null
            if (backgroundRequest.value?.id == id) backgroundRequest.value = null
            withContext(NonCancellable) {
                staged?.cancel()
                runCatching { store.collectUnusedFiles() }
                if (store.isCurrent(context)) refresh()
            }
        }
    }

    internal fun downloadNavigation(id: String, url: String) {
        val current = backgroundRequest.value?.takeIf { it.id == id } ?: return
        if (url == current.url) return
        val location = runCatching { offlineLocation(url) }.getOrNull()
        val expected = offlineLocation(current.url)
        if (location?.workId == expected.workId && expected.chapterId == null && location.representation == expected.representation) {
            val old = current.capture
            val capture = OfflineCaptureRequest(url, old.expectedIdentity, old.isCurrent, old.stageResource, old.publish, old.onFailure, old.onProgress)
            backgroundRequest.value = current.copy(url = url, capture = capture)
        } else current.capture.onFailure("Open this work in Read to confirm access, then retry.", null)
    }

    internal fun downloadFailure(id: String, status: Int?, retryAfter: String?) {
        val request = backgroundRequest.value?.takeIf { it.id == id } ?: return
        if (status in setOf(429, 503)) gate.pause(retryAfter)
        debug("Chapter load failed. HTTP status: ${status ?: "network error"}; retry delay: ${retryAfter?.toLongOrNull()?.let { "$it seconds" } ?: "default"}.")
        request.capture.onFailure("AO3 could not load this chapter. Open it in Read or retry later.", retryAfter)
    }

    internal fun retry(workId: Long) = launchAction {
        val context = store.context.value?.takeIf(store::isCurrent) ?: return@launchAction
        store.retryWork(context, workId)
        debug("Retry requested.")
        refresh()
        kick()
    }

    internal fun remove(workId: Long) = launchAction {
        downloadTask?.cancel()
        cancelCapture()
        val context = store.context.value?.takeIf(store::isCurrent) ?: return@launchAction
        store.removeWork(context, workId)
        refresh()
        kick()
    }

    internal fun clearAutomatic() = launchAction {
        if (automaticCapture) cancelCapture()
        if (backgroundRequest.value?.automatic == true) { downloadId.value = null; downloadTask?.cancel() }
        store.clearAutomatic()
        refresh()
    }

    internal fun readingSaved(page: OfflinePage, isCurrent: () -> Boolean) = launchAction {
        if (!automaticAllowed() || !isCurrent()) return@launchAction
        val context = store.context.value?.takeIf(store::isCurrent) ?: return@launchAction
        if (backgroundRequest.value?.automatic == true) { downloadId.value = null; downloadTask?.cancel() }
        automaticPage = page
        store.enqueuePrefetch(context, page, refreshCurrent = true, preferences = settings.offlinePreferences.value) { automaticAllowed() && isCurrent() }
        refresh()
        kick()
    }

    internal suspend fun open(url: String, scroll: Float = 0f, fragment: String = ""): OpenOfflineChapter? {
        if (!enabled) return null
        val context = store.context.value?.takeIf(store::isCurrent) ?: store.initialize() ?: return null
        if (runCatching { offlineLocation(url) }.isFailure) return null
        val opened = store.open(context, url, scroll, fragment)
        try { refresh() } catch (error: Exception) { opened?.document?.close(); throw error }
        return opened
    }

    internal fun dismissMessage() { statusMessage.value = null }
    internal fun leaveLivePage() { cancelCapture(); observation.value = null; interactiveLoading(false) }
    internal fun notify(message: String) { statusMessage.value = message }

    private suspend fun refresh() {
        val context = store.context.value
        workStates.value = if (context != null && store.isCurrent(context)) store.statuses(context) else emptyList()
        storageState.value = store.storageUsage()
        refreshQueueAvailability()
    }

    private suspend fun refreshQueueAvailability() {
        val context = store.context.value
        queueActive.value = context != null && store.isCurrent(context) &&
            (store.nextJob(context, prefetchAllowed()) != null || store.nextRetryAt(context, prefetchAllowed()) != null)
    }

    private fun launchAction(action: suspend () -> Unit) = scope.launch {
        try { action() } catch (_: CancellationException) { } catch (_: Exception) {
            statusMessage.value = "The download could not be changed. Try again."
        }
    }
}
