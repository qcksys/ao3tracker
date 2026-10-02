package com.qcksys.ao3tracker.ui.screens.read

import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import com.qcksys.ao3tracker.data.model.DataException
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.model.ListWorksEvent
import com.qcksys.ao3tracker.data.model.SaveSearchEvent
import com.qcksys.ao3tracker.data.model.BrowsingReadyEvent
import com.qcksys.ao3tracker.data.model.SetWorkHiddenEvent
import com.qcksys.ao3tracker.data.settings.BrowsingState
import com.qcksys.ao3tracker.data.model.ScrollProgressEvent
import com.qcksys.ao3tracker.data.model.WebViewMessage
import com.qcksys.ao3tracker.data.model.WorkBadgePayload
import com.qcksys.ao3tracker.data.model.WorkChapterIndexEvent
import com.qcksys.ao3tracker.data.model.WorkInfoEvent
import com.qcksys.ao3tracker.data.model.WorkTagsEvent
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.data.sync.SyncTriggers
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.util.AppLogger
import com.qcksys.ao3tracker.diagnostics.Diagnostics
import com.qcksys.ao3tracker.util.JsonConfig
import com.qcksys.ao3tracker.ui.components.ReaderLinkAction
import com.qcksys.ao3tracker.ui.navigation.ReadNavigation
import com.qcksys.ao3tracker.ui.navigation.readNavigation
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class ReadScreenModel(
    private val repository: Ao3Repository,
    private val savedSearchRepository: SavedSearchRepository,
    private val syncTriggers: SyncTriggers,
    private val accountData: AccountDataStore,
    private val appSettings: AppSettings
) : ScreenModel {

    private val _currentUrl = MutableStateFlow("https://archiveofourown.org")
    val currentUrl: StateFlow<String> = _currentUrl.asStateFlow()

    // Set when the in-page "Save this search" button is tapped; the UI shows a
    // save/update dialog and clears this on confirm/cancel.
    private val _pendingSaveSearch = MutableStateFlow<SaveSearchEvent?>(null)
    val pendingSaveSearch: StateFlow<SaveSearchEvent?> = _pendingSaveSearch.asStateFlow()
    val savedSearches = savedSearchRepository.observeLive()

    private val _linkActionMessage = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val linkActionMessage: SharedFlow<String> = _linkActionMessage.asSharedFlow()

    private val _canGoBack = MutableStateFlow(false)
    val canGoBack: StateFlow<Boolean> = _canGoBack.asStateFlow()

    private val _canGoForward = MutableStateFlow(false)
    val canGoForward: StateFlow<Boolean> = _canGoForward.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _scrollProgress = MutableStateFlow(0f)
    val scrollProgress: StateFlow<Float> = _scrollProgress.asStateFlow()

    // Snippets of JS to evaluate in the WebView (e.g. applying list-page badges).
    // extraBufferCapacity guarantees emit() never suspends; replay=0 because each
    // injection is a one-shot.
    private val _jsInjectionFlow = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val jsInjectionFlow: SharedFlow<String> = _jsInjectionFlow.asSharedFlow()
    private var browsingUrl: String? = null

    // Cache for work info until we have all the data
    private var pendingWorkInfo: WorkInfoEvent? = null
    private var pendingWorkTags: WorkTagsEvent? = null

    // Track the previous chapter to mark as read when navigating to next chapter
    private data class ChapterLocation(val workId: Long, val chapterId: Long)
    private var previousChapter: ChapterLocation? = null
    private var cachedTrackingSession: Long? = null

    companion object {
        private const val TAG = "ReadScreenModel"
    }

    init {
        screenModelScope.launch {
            appSettings.diagnosticSession.collect {
                updateWebViewDiagnostics()
            }
        }
        screenModelScope.launch {
            combine(appSettings.browsingPreferences, savedSearchRepository.observeLive()) { preferences, searches ->
                BrowsingState(preferences.hiddenWorkIds, preferences.hiddenTags, searches.map { it.url }, preferences.languageFilterEnabled, preferences.searchLanguage, preferences.maxFandoms, preferences.hideCaughtUp)
            }.collect { state ->
                browsingUrl?.let { emitBrowsingState(it, state) }
            }
        }
        screenModelScope.launch {
            var previousOwner: String? = null
            accountData.active.collect { account ->
                if (previousOwner != null && account?.owner != previousOwner) {
                    pendingWorkInfo = null
                    pendingWorkTags = null
                    previousChapter = null
                    _pendingSaveSearch.value = null
                    navigateToHome()
                }
                previousOwner = account?.owner
            }
        }
        screenModelScope.launch {
            var wasIncognito = appSettings.incognitoModeEnabled.value
            appSettings.incognitoModeEnabled.collect { enabled ->
                if (wasIncognito && !enabled) {
                    _jsInjectionFlow.emit("window.__ao3Tracker?.reportReadingActivity?.();")
                }
                wasIncognito = enabled
            }
        }
    }

    fun updateNavigationState(canGoBack: Boolean, canGoForward: Boolean) {
        _canGoBack.value = canGoBack
        _canGoForward.value = canGoForward
    }

    fun updateLoadingState(isLoading: Boolean) {
        _isLoading.value = isLoading
    }

    fun updateCurrentUrl(url: String) {
        if (url != browsingUrl) browsingUrl = null
        _currentUrl.value = url
    }

    fun handleWebViewMessage(messageJson: String) {
        val owner = accountData.active.value?.owner
        val accountGeneration = accountData.generation
        val trackingSession = appSettings.captureTrackingSession()
        val diagnosticSession = appSettings.captureDiagnosticSession()
        val canTrack = {
            trackingSession != null && appSettings.isTrackingSessionCurrent(trackingSession) &&
                accountData.generation == accountGeneration && accountData.active.value?.owner == owner
        }
        screenModelScope.launch {
            if (accountData.generation != accountGeneration || accountData.active.value?.owner != owner) return@launch
            try {
                val message = parseWebViewMessage(messageJson)
                if (message is WebViewMessage.Diagnostic &&
                    (diagnosticSession == null || diagnosticSession != appSettings.captureDiagnosticSession())) return@launch
                processMessage(message, canTrack)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SerializationException) {
                AppLogger.e("Failed to parse WebView message", TAG, e)
            } catch (e: DataException) {
                AppLogger.w("Invalid WebView message: ${e.message}", TAG, e)
            } catch (e: Exception) {
                AppLogger.e("Unexpected error handling WebView message", TAG, e)
            }
        }
    }

    private fun parseWebViewMessage(messageJson: String): WebViewMessage {
        val jsonElement = JsonConfig.json.parseToJsonElement(messageJson)
        val type = jsonElement.jsonObject["type"]?.jsonPrimitive?.content

        return when (type) {
            "diagnostic" -> WebViewMessage.Diagnostic(jsonElement.jsonObject.getValue("data").jsonObject)
            "workInfo" -> WebViewMessage.WorkInfo(
                JsonConfig.json.decodeFromString<WorkInfoEvent>(messageJson)
            )
            "workTags" -> WebViewMessage.WorkTags(
                JsonConfig.json.decodeFromString<WorkTagsEvent>(messageJson)
            )
            "workChapterIndex" -> WebViewMessage.ChapterIndex(
                JsonConfig.json.decodeFromString<WorkChapterIndexEvent>(messageJson)
            )
            "scrollProgress" -> WebViewMessage.ScrollProgress(
                JsonConfig.json.decodeFromString<ScrollProgressEvent>(messageJson)
            )
            "listWorks" -> WebViewMessage.ListWorks(
                JsonConfig.json.decodeFromString<ListWorksEvent>(messageJson)
            )
            "saveSearch" -> WebViewMessage.SaveSearch(
                JsonConfig.json.decodeFromString<SaveSearchEvent>(messageJson)
            )
            "browsingReady" -> WebViewMessage.BrowsingReady(
                JsonConfig.json.decodeFromString<BrowsingReadyEvent>(messageJson)
            )
            "setWorkHidden" -> WebViewMessage.SetWorkHidden(
                JsonConfig.json.decodeFromString<SetWorkHiddenEvent>(messageJson)
            )
            else -> {
                AppLogger.w("Unknown WebView message type: $type", TAG)
                WebViewMessage.Unknown(type, messageJson)
            }
        }
    }

    private suspend fun processMessage(message: WebViewMessage, canTrack: () -> Boolean) {
        val currentSession = appSettings.captureTrackingSession()
        if (cachedTrackingSession != currentSession) {
            pendingWorkInfo = null
            pendingWorkTags = null
            previousChapter = null
            cachedTrackingSession = currentSession
        }
        when (message) {
            is WebViewMessage.Diagnostic -> Diagnostics.captureWebView(message.data)
            is WebViewMessage.WorkInfo -> {
                if (!canTrack()) return
                pendingWorkInfo = message.event
                tryToSaveWork(canTrack)
            }
            is WebViewMessage.WorkTags -> {
                if (!canTrack()) return
                pendingWorkTags = message.event
                tryToSaveWork(canTrack)
            }
            is WebViewMessage.ChapterIndex -> {
                if (canTrack()) repository.saveChapterIndex(message.event, canTrack)
            }
            is WebViewMessage.ScrollProgress -> {
                _scrollProgress.value = message.event.scrollPercentage / 100f
                if (canTrack()) repository.updateScrollProgress(message.event, canTrack)
            }
            is WebViewMessage.ListWorks -> {
                handleListWorks(message.event)
            }
            is WebViewMessage.SaveSearch -> {
                _pendingSaveSearch.value = message.event
            }
            is WebViewMessage.BrowsingReady -> {
                if (!isTrustedAo3Url(message.event.url)) return
                browsingUrl = message.event.url
                updateWebViewDiagnostics()
                refreshBrowsingState(message.event.url)
            }
            is WebViewMessage.SetWorkHidden -> {
                if (!isTrustedAo3Url(message.event.url) || message.event.url != browsingUrl) return
                appSettings.setWorkHidden(message.event.workId, message.event.hidden, message.event.title ?: repository.getWorkByIdOnce(message.event.workId)?.title)
            }
            is WebViewMessage.Unknown -> {
                // Already logged in parseWebViewMessage
            }
        }
    }

    private suspend fun updateWebViewDiagnostics() {
        val enabled = appSettings.captureDiagnosticSession() != null
        _jsInjectionFlow.emit("window.__ao3Tracker?.setDiagnosticsEnabled?.($enabled);")
    }

    fun handleLinkAction(action: ReaderLinkAction) {
        val accountGeneration = accountData.generation
        val pageUrl = currentUrl.value
        screenModelScope.launch {
            if (accountData.generation != accountGeneration) return@launch
            try {
                val message = when (action) {
                    is ReaderLinkAction.TrackWork -> {
                        repository.addTrackedWork(action.workId, action.title) {
                            accountData.generation == accountGeneration
                        }
                        handleListWorks(ListWorksEvent(url = pageUrl, workIds = listOf(action.workId)))
                        "Added to tracked works"
                    }
                    is ReaderLinkAction.BlockWork -> {
                        appSettings.setWorkHidden(action.workId, true, action.title ?: repository.getWorkByIdOnce(action.workId)?.title)
                        "Work added to blocklist"
                    }
                    is ReaderLinkAction.BlockTag -> {
                        appSettings.setHiddenTags((appSettings.browsingPreferences.value.hiddenTags + action.tag).joinToString("\n"))
                        "Tag added to blocklist"
                    }
                }
                _linkActionMessage.emit(message)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                AppLogger.e("Failed to apply reader link action", TAG, e)
                _linkActionMessage.emit("Could not save this change. Please try again.")
            }
        }
    }

    /** Persist a saved search after the user confirms the name, then trigger a sync. */
    fun confirmSaveSearch(name: String, url: String) {
        _pendingSaveSearch.value = null
        val trimmed = name.trim()
        if (trimmed.isEmpty() || !isTrustedAo3Url(url)) return
        screenModelScope.launch {
            savedSearchRepository.save(trimmed, url)
            syncTriggers.notifySavedSearchChanged()
        }
    }

    fun confirmUpdateSavedSearch(id: String, url: String) {
        _pendingSaveSearch.value = null
        if (!isTrustedAo3Url(url)) return
        val accountGeneration = accountData.generation
        screenModelScope.launch {
            try {
                savedSearchRepository.updateUrl(id, url) { accountData.generation == accountGeneration }
                syncTriggers.notifySavedSearchChanged()
                _linkActionMessage.emit("Saved search updated")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                AppLogger.e("Failed to update saved search", TAG, e)
                _linkActionMessage.emit("Could not update this saved search. Please try again.")
            }
        }
    }

    /** Dismiss the save-search dialog without saving. */
    fun dismissSaveSearch() {
        _pendingSaveSearch.value = null
    }

    private suspend fun handleListWorks(event: ListWorksEvent) {
        if (event.workIds.isEmpty() || !isTrustedAo3Url(event.url)) return
        val badges = repository.getWorkBadges(event.workIds)
        if (badges.isEmpty()) return

        val payloadJson = JsonConfig.json.encodeToString(
            ListSerializer(WorkBadgePayload.serializer()),
            badges
        )
        // Pass the JSON as a string literal that we eval at runtime to avoid
        // re-escaping inside a JS string template.
        val script = """
            (function() {
                if (location.href !== ${jsStringLiteral(event.url)}) return;
                if (window.__ao3Tracker && window.__ao3Tracker.applyListBadges) {
                    window.__ao3Tracker.applyListBadges(${jsStringLiteral(payloadJson)});
                }
            })();
        """.trimIndent()
        _jsInjectionFlow.emit(script)
    }

    private suspend fun refreshBrowsingState(url: String) {
        val preferences = appSettings.browsingPreferences.value
        val searches = savedSearchRepository.observeLive().first()
        emitBrowsingState(url, BrowsingState(preferences.hiddenWorkIds, preferences.hiddenTags, searches.map { it.url }, preferences.languageFilterEnabled, preferences.searchLanguage, preferences.maxFandoms, preferences.hideCaughtUp))
    }

    private suspend fun emitBrowsingState(url: String, state: BrowsingState) {
        val payload = JsonConfig.json.encodeToString(state)
        _jsInjectionFlow.emit("""
            if (location.href === ${jsStringLiteral(url)}) {
                window.__ao3Tracker?.applyBrowsingState?.(${jsStringLiteral(payload)});
            }
        """.trimIndent())
    }

    /** Wraps a string for safe embedding inside a JS source as a string literal. */
    private fun jsStringLiteral(value: String): String {
        val escaped = value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace(" ", "\\u2028")
            .replace(" ", "\\u2029")
        return "'$escaped'"
    }

    private suspend fun tryToSaveWork(canTrack: () -> Boolean) {
        val workInfo = pendingWorkInfo ?: return
        val workTags = pendingWorkTags

        // Save work with whatever tags we have (tags may come in separate message)
        repository.saveWorkFromWebView(workInfo, workTags, canTrack)
        if (!canTrack()) return

        // Mark previous chapter as read if we navigated to a different chapter of the same work
        markPreviousChapterAsReadIfNeeded(workInfo, canTrack)
        if (!canTrack()) return

        // Clear cache after saving
        if (workTags != null) {
            pendingWorkInfo = null
            pendingWorkTags = null
        }
    }

    /**
     * Mark the previous chapter as fully read when navigating to the next chapter of the same work.
     * This assumes that if you're moving to the next chapter, you've finished reading the current one.
     */
    private suspend fun markPreviousChapterAsReadIfNeeded(currentWorkInfo: WorkInfoEvent, canTrack: () -> Boolean) {
        val currentWorkId = extractWorkIdFromUrl(currentWorkInfo.url) ?: return
        val currentChapterId = currentWorkInfo.chapterId?.toLongOrNull()
            ?: extractChapterIdFromUrl(currentWorkInfo.url)
            ?: return

        val prev = previousChapter

        // Update the tracked chapter to current
        previousChapter = ChapterLocation(currentWorkId, currentChapterId)

        // If we have a previous chapter on the same work but different chapter, mark it as read
        if (prev != null && prev.workId == currentWorkId && prev.chapterId != currentChapterId) {
            AppLogger.d("Marking previous chapter ${prev.chapterId} as read (navigated to chapter $currentChapterId)", TAG)
            repository.markChapterAsRead(prev.chapterId, prev.workId, canTrack)
        }
    }

    private fun extractWorkIdFromUrl(url: String): Long? {
        val regex = Regex("/works/(\\d+)")
        return regex.find(url)?.groupValues?.get(1)?.toLongOrNull()
    }

    private fun extractChapterIdFromUrl(url: String): Long? {
        val regex = Regex("/chapters/(\\d+)")
        return regex.find(url)?.groupValues?.get(1)?.toLongOrNull()
    }

    suspend fun navigateToReadingPosition(navigation: ReadNavigation) {
        val generation = accountData.generation
        val destination = navigation.workId?.let { repository.getWorkByIdOnce(it)?.readNavigation() } ?: navigation
        if (accountData.generation != generation) return
        if (destination.scrollProgress == null) {
            navigateToExternalUrl(destination.url)
        } else {
            navigateToUrlWithScroll(destination.url, destination.scrollProgress)
        }
    }

    fun navigateToUrl(url: String) {
        if (!isTrustedAo3Url(url)) return
        // Reset scroll progress when navigating to a new page
        _scrollProgress.value = 0f
        // Add #chapters fragment for work URLs to auto-scroll to content
        _currentUrl.value = addChaptersFragment(url)
    }

    fun navigateToExternalUrl(url: String) {
        if (!isTrustedAo3Url(url)) return
        _scrollProgress.value = 0f
        _currentUrl.value = url
    }

    fun navigateToHome() {
        _scrollProgress.value = 0f
        _currentUrl.value = "https://archiveofourown.org"
    }

    fun isOnHomePage(): Boolean {
        val url = _currentUrl.value
        return url == "https://archiveofourown.org" ||
               url == "https://archiveofourown.org/" ||
               url.startsWith("https://archiveofourown.org/#")
    }

    @OptIn(ExperimentalTime::class)
    fun navigateToUrlWithScroll(url: String, scrollProgress: Float) {
        if (!isTrustedAo3Url(url)) return
        // Build URL with scrollTo param and timestamp to force reload
        val timestamp = Clock.System.now().toEpochMilliseconds()
        val scrollPercent = (scrollProgress * 100).toInt()

        // Add query params first, then fragment (fragments must come last in URL)
        val urlWithParams = if (url.contains("?")) {
            "$url&scrollTo=$scrollPercent&_t=$timestamp"
        } else {
            "$url?scrollTo=$scrollPercent&_t=$timestamp"
        }
        // Add #chapters fragment at the end for auto-scroll to content area
        _currentUrl.value = addChaptersFragment(urlWithParams)
    }

    /**
     * Add #chapters fragment to work URLs to auto-scroll to content
     */
    private fun addChaptersFragment(url: String): String {
        // Only add fragment for work URLs that don't already have one
        if (url.contains("#")) return url

        // Check if it's a work URL (contains /works/ followed by a number)
        val workPattern = Regex("/works/\\d+")
        return if (workPattern.containsMatchIn(url)) {
            "$url#chapters"
        } else {
            url
        }
    }
}
