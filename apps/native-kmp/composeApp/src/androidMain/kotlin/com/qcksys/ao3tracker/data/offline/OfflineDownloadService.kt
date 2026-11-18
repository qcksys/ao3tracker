package com.qcksys.ao3tracker.data.offline

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.qcksys.ao3tracker.MainActivity
import com.qcksys.ao3tracker.ui.components.Ao3PageWebView
import com.qcksys.ao3tracker.ui.components.OfflineCaptureConnection
import com.qcksys.ao3tracker.webview.OfflineObservationScriptGenerated
import com.qcksys.ao3tracker.webview.guardAo3Script
import com.qcksys.ao3tracker.webview.isCloudflareChallengeFrame
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class OfflineDownloadService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var coordinator: OfflineCoordinator? = null
    private var observer: Job? = null
    private var view: WebView? = null
    private var capture: OfflineCaptureConnection? = null
    private var requestId: String? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val next = requestedCoordinator
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Offline chapter downloads", NotificationManager.IMPORTANCE_LOW))
        ServiceCompat.startForeground(this, NOTIFICATION,
            notification(OfflineDownloadNotification("Saving chapters for offline reading", "Preparing chapter downloads")),
            if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0)
        manager.cancel(AO3_CHECK_NOTIFICATION)
        if (next == null) { stopSelf(); return START_NOT_STICKY }
        if (coordinator !== next) {
            observer?.cancel()
            releasePage()
            coordinator?.setDownloadServiceActive(false)
            coordinator = next
            next.setDownloadServiceActive(true)
            observer = scope.launch {
                var chapters = emptyMap<Long, Pair<Int, Int>>()
                // Keep "Preparing" until the first chapter starts or the queue grace period passes.
                var preparing: Job? = launch {
                    delay(QUEUE_GRACE_MILLIS)
                    if (next.progress.value == null) manager.notify(NOTIFICATION,
                        notification(offlineDownloadNotification(null, null), offlineQueueProgress(next.downloads.value, chapters)))
                }
                combine(next.background, next.hasPendingDownloads, next.network, next.downloads, next.progress) { request, pending, network, downloads, shown ->
                    ServiceState(request, pending, network.connected, downloads, shown)
                }.collect { (request, pending, connected, downloads, shown) ->
                        if (!connected || !pending && request == null) {
                            // The queue pauses for a Cloudflare check that only the reader can show.
                            if (next.ao3Check.value != null) manager.notify(AO3_CHECK_NOTIFICATION, notification(
                                OfflineDownloadNotification("Downloads paused", "AO3 wants to check you're not a robot. Tap to continue."), ongoing = false))
                            stopSelf()
                            return@collect
                        }
                        if (request?.id != requestId) {
                            releasePage()
                            if (request != null) load(next, request)
                        }
                        chapters = offlineQueueChapters(downloads, chapters)
                        if (shown != null) { preparing?.cancel(); preparing = null }
                        val content = if (shown == null && preparing?.isActive == true) {
                            OfflineDownloadNotification("Saving chapters for offline reading", "Preparing chapter downloads")
                        } else offlineDownloadNotification(shown, downloads.firstOrNull { it.work.workId == shown?.workId })
                        manager.notify(NOTIFICATION, notification(content, offlineQueueProgress(downloads, chapters)))
                    }
            }
        }
        return START_NOT_STICKY
    }

    @SuppressLint("SetJavaScriptEnabled", "WakelockTimeout")
    private fun load(owner: OfflineCoordinator, request: OfflineDownloadRequest) {
        requestId = request.id
        val lock = wakeLock ?: getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:offline-downloads").also { wakeLock = it }
        if (lock.isHeld) lock.release()
        lock.acquire(10 * 60 * 1000L)
        val page = Ao3PageWebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            capture = OfflineCaptureConnection(this, scope)
            var startedCapture = false
            var pageVersion = 0
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val target = request?.url?.toString()
                    return !isTrustedAo3Url(target) && !isCloudflareChallengeFrame(target, request?.isForMainFrame != false)
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    capture?.cancel()
                    startedCapture = false
                    pageVersion++
                    url?.let { owner.downloadNavigation(request.id, it) }
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    if (startedCapture || view == null || url == null || !isTrustedAo3Url(url)) return
                    val current = owner.background.value?.takeIf { it.id == request.id && it.url == url } ?: return
                    startedCapture = true
                    val version = pageVersion
                    // The page's AO3 account decides which account's saved works the download belongs to.
                    view.evaluateJavascript(guardAo3Script("${OfflineObservationScriptGenerated.script}; return Ao3OfflineObservation.observe(document, location.href);")) { body ->
                        if (pageVersion != version || owner.background.value !== current) return@evaluateJavascript
                        if (!owner.downloadObserved(current.id, parseOfflineObservation(body, url))) return@evaluateJavascript
                        current.capture.onProgress("Chapter loaded; capturing text, styles and resources.")
                        capture?.start(current.capture, discoverChapter = true)
                    }
                }

                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    if (request?.isForMainFrame == true) owner.downloadFailure(this@OfflineDownloadService.requestId ?: return, null, null)
                }

                override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, response: WebResourceResponse?) {
                    if (request?.isForMainFrame != true) return
                    val id = this@OfflineDownloadService.requestId ?: return
                    val headers = response?.responseHeaders.orEmpty()
                    // Cloudflare marks its check page this way; a real browser often passes it by itself and reloads.
                    if (headers.any { it.key.equals("cf-mitigated", true) && it.value.equals("challenge", true) }) {
                        owner.downloadChallenged(id)
                        return
                    }
                    owner.downloadFailure(id, response?.statusCode, headers.entries.firstOrNull { it.key.equals("Retry-After", true) }?.value)
                }

                override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                    if (view === this@OfflineDownloadService.view) {
                        owner.debug("The download WebView stopped unexpectedly; the chapter will be retried.")
                        owner.downloadFailure(request.id, null, null)
                        releasePage(renderProcessGone = true)
                    } else view?.destroy()
                    return true
                }
            }
        }
        view = page
        // AO3 asks before showing Mature, Explicit and Not Rated works. Downloads proceed as its Proceed link does, by
        // setting AO3's view_adult session cookie, which the reader's AO3 WebView shares.
        CookieManager.getInstance().setCookie(AO3_ORIGIN, "view_adult=true; Path=/; Secure") {
            if (view === page && requestId == request.id) page.loadUrl(request.url)
        }
    }

    private data class ServiceState(val request: OfflineDownloadRequest?, val pending: Boolean, val connected: Boolean,
        val downloads: List<OfflineWorkStatus>, val shown: OfflineDownloadRequest?)

    private fun notification(content: OfflineDownloadNotification, queue: OfflineQueueProgress? = null, ongoing: Boolean = true) = NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle(content.title)
        .setContentText(content.text)
        .apply {
            if (queue == null) return@apply
            if (queue.works > 0) setSubText(if (queue.works == 1) "1 work in queue" else "${queue.works} works in queue")
            if (queue.total > 0) setProgress(queue.total, queue.done, false)
        }
        .setContentIntent(PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).apply {
            action = ACTION_OPEN_DOWNLOADS
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        .setOngoing(ongoing).setAutoCancel(!ongoing).setOnlyAlertOnce(true).setPriority(NotificationCompat.PRIORITY_LOW).build()

    private fun releasePage(renderProcessGone: Boolean = false) {
        capture?.close(renderProcessGone)
        capture = null
        if (!renderProcessGone) view?.stopLoading()
        view?.destroy()
        view = null
        requestId = null
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        coordinator?.notify("Android paused background downloads. Reopen the app to resume.")
        stopSelf()
    }

    override fun onDestroy() {
        observer?.cancel()
        releasePage()
        coordinator?.setDownloadServiceActive(false)
        if (requestedCoordinator === coordinator) requestedCoordinator = null
        if (wakeLock?.isHeld == true) wakeLock?.release()
        wakeLock = null
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        internal const val ACTION_OPEN_DOWNLOADS = "com.qcksys.ao3tracker.OPEN_DOWNLOADS"
        private const val CHANNEL = "ao3_offline_downloads"
        private const val NOTIFICATION = 2043
        private const val AO3_CHECK_NOTIFICATION = 2044
        private const val AO3_ORIGIN = "https://archiveofourown.org"
        private var requestedCoordinator: OfflineCoordinator? = null

        internal fun start(context: Context, coordinator: OfflineCoordinator) {
            requestedCoordinator = coordinator
            try {
                ContextCompat.startForegroundService(context, Intent(context, OfflineDownloadService::class.java))
            } catch (_: IllegalStateException) {
                coordinator.debug("Android did not allow the background service to start. Reopen the app to resume.")
            }
        }
    }
}
