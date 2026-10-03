package com.qcksys.ao3tracker.ui.components

import android.webkit.CookieManager
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.qcksys.ao3tracker.data.offline.OfflineAssetClient
import com.qcksys.ao3tracker.data.offline.OfflineCaptureRequest
import com.qcksys.ao3tracker.data.offline.OfflineCaptureSession
import com.qcksys.ao3tracker.data.offline.OfflineHttpTransport
import com.qcksys.ao3tracker.data.offline.OfflineThrottled
import com.qcksys.ao3tracker.data.offline.offlineCaptureFailure
import com.qcksys.ao3tracker.data.offline.offlineJson
import com.qcksys.ao3tracker.data.offline.offlineLocation
import com.qcksys.ao3tracker.diagnostics.PostHogCrashReporter
import com.qcksys.ao3tracker.webview.OfflineCaptureScriptGenerated
import com.qcksys.ao3tracker.webview.guardAo3Script
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.atomic.AtomicInteger
import kotlin.uuid.Uuid

@Serializable
private data class OfflineCaptureOptions(val token: String, val url: String)

internal class OfflineCaptureConnection(
    private val view: WebView,
    private val scope: CoroutineScope,
    private val suppliedAssets: OfflineAssetClient? = null
) {
    private data class Active(
        val token: String,
        val request: OfflineCaptureRequest,
        val messages: Channel<String>,
        val queuedCharacters: AtomicInteger = AtomicInteger()
    )
    private val active = MutableStateFlow<Active?>(null)
    private var worker: Job? = null
    private var transport: OfflineHttpTransport? = null
    private var closed = false
    private val supported = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)

    init {
        if (supported) WebViewCompat.addWebMessageListener(view, "OfflineCaptureBridge", setOf("https://archiveofourown.org", "https://www.archiveofourown.org")) { sender, message, origin, mainFrame, _ ->
            val capture = active.value ?: return@addWebMessageListener
            if (!mainFrame || !isTrustedAo3Url(origin.toString()) || !isTrustedAo3Url(sender.url) || !capture.request.isCurrent()) return@addWebMessageListener
            val body = message.data ?: return@addWebMessageListener
            if (body.length > 110_000) return@addWebMessageListener
            val token = runCatching { offlineJson.parseToJsonElement(body).jsonObject["token"]?.jsonPrimitive?.content }.getOrNull()
            if (token != capture.token) return@addWebMessageListener
            if (capture.queuedCharacters.addAndGet(body.length) > 32 * 1024 * 1024 || !capture.messages.trySend(body).isSuccess) {
                cancel()
                capture.request.onFailure("The chapter is too large to save.", null)
            }
        }
    }

    fun start(request: OfflineCaptureRequest) {
        if (closed) return
        cancel()
        if (!supported) {
            request.onFailure("Update Android System WebView to save works.", null)
            return
        }
        if (!request.isCurrent() || runCatching { offlineLocation(view.url.orEmpty()) == offlineLocation(request.url) }.getOrDefault(false).not()) return
        val capture = Active(Uuid.random().toString(), request, Channel(Channel.UNLIMITED))
        active.value = capture
        val assets = suppliedAssets ?: run {
            val http = transport ?: OfflineHttpTransport().also { transport = it }
            OfflineAssetClient({ url -> withContext(Dispatchers.Main.immediate) { CookieManager.getInstance().getCookie(url) } }, http::request)
        }
        val session = OfflineCaptureSession(capture.token, request.url, request.expectedIdentity,
            { active.value === capture && request.isCurrent() }, assets, request.stageResource, request.publish, request.onProgress)
        worker = scope.launch(Dispatchers.Default) {
            try {
                for (message in capture.messages) {
                    capture.queuedCharacters.addAndGet(-message.length)
                    val responses = session.receive(message)
                    withContext(Dispatchers.Main.immediate) {
                        if (active.value !== capture || !request.isCurrent() || !isTrustedAo3Url(view.url)) return@withContext
                        responses.forEach { response ->
                            view.evaluateJavascript(guardAo3Script("if (window.__ao3OfflineOptions?.token === ${JsonPrimitive(capture.token)}) window.__ao3OfflineCapture?.receive(${offlineJson.encodeToString(response)});"), null)
                        }
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                withContext(Dispatchers.Main.immediate) {
                    if (active.value !== capture) return@withContext
                    val detail = "Offline capture failed during ${session.stage} (${error::class.simpleName}): ${offlineCaptureFailure(error)}"
                    request.onProgress(detail)
                    PostHogCrashReporter.captureException(IllegalStateException(detail).apply { stackTrace = error.stackTrace })
                    cancel()
                    request.onFailure(offlineCaptureFailure(error), (error as? OfflineThrottled)?.retryAfter)
                }
            } finally {
                session.cancel()
            }
        }
        val options = offlineJson.encodeToString(OfflineCaptureOptions(capture.token, request.url))
        view.evaluateJavascript(guardAo3Script("window.__ao3OfflineOptions = $options; ${OfflineCaptureScriptGenerated.script}"), null)
    }

    fun cancel(renderProcessGone: Boolean = false) {
        if (closed) return
        active.value?.messages?.cancel()
        active.value = null
        worker?.cancel()
        worker = null
        if (!renderProcessGone && isTrustedAo3Url(view.url)) view.evaluateJavascript(guardAo3Script("window.__ao3OfflineCapture?.cancel();"), null)
    }

    fun close(renderProcessGone: Boolean = false) {
        if (closed) return
        cancel(renderProcessGone)
        closed = true
        if (!renderProcessGone && supported) WebViewCompat.removeWebMessageListener(view, "OfflineCaptureBridge")
        transport?.close()
        transport = null
    }
}
