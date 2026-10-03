package com.qcksys.ao3tracker.ui.components

import android.annotation.SuppressLint
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.qcksys.ao3tracker.data.offline.OFFLINE_CONTENT_POLICY
import com.qcksys.ao3tracker.data.offline.OFFLINE_ORIGIN
import com.qcksys.ao3tracker.data.offline.OfflineReaderDocument
import com.qcksys.ao3tracker.data.offline.OfflineReaderEvent
import java.io.ByteArrayInputStream

internal actual fun supportsOfflineReading(): Boolean = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)

private fun blockedOfflineRequest() = WebResourceResponse("text/plain", "UTF-8", 403, "Unavailable", emptyMap(), ByteArrayInputStream(byteArrayOf()))

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal actual fun OfflineAo3WebView(
    document: OfflineReaderDocument,
    modifier: Modifier,
    onEvent: (OfflineReaderEvent) -> Unit,
    onFailure: () -> Unit,
    onBack: () -> Unit
) {
    val event by rememberUpdatedState(onEvent)
    val failure by rememberUpdatedState(onFailure)
    BackHandler(onBack = onBack)
    if (!supportsOfflineReading()) {
        Text("Update Android System WebView to read saved works.", modifier)
        return
    }
    key(document.token) {
        AndroidView(
            modifier = modifier,
            factory = { context ->
                Ao3PageWebView(context).apply {
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = false
                        allowFileAccess = false
                        allowContentAccess = false
                        mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        loadWithOverviewMode = true
                        useWideViewPort = true
                        builtInZoomControls = true
                        displayZoomControls = false
                    }
                    val loader = WebViewAssetLoader.Builder().addPathHandler("/") { path ->
                        val content = runCatching { document.readPath("/$path") }.getOrNull()
                        if (content == null) blockedOfflineRequest() else WebResourceResponse(
                            content.mimeType, "UTF-8", 200, "OK",
                            mapOf("Content-Security-Policy" to OFFLINE_CONTENT_POLICY, "Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff"),
                            ByteArrayInputStream(content.bytes)
                        )
                    }.build()
                    WebViewCompat.addWebMessageListener(this, "OfflineBridge", setOf(OFFLINE_ORIGIN)) { view, message, origin, mainFrame, _ ->
                        if (mainFrame && origin.toString() == OFFLINE_ORIGIN && document.isDocumentUrl(view.url)) {
                            message.data?.let { document.event(it) }?.let(event)
                        }
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse =
                            if (document.isActive() && request?.method == "GET") loader.shouldInterceptRequest(request.url) ?: blockedOfflineRequest()
                            else blockedOfflineRequest()

                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean =
                            request?.isForMainFrame != true || !document.isDocumentUrl(request.url.toString())

                        override fun onPageFinished(view: WebView, url: String?) {
                            if (document.isDocumentUrl(url)) view.evaluateJavascript(document.initializationScript(), null)
                        }

                        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                            if (request?.isForMainFrame == true && document.isActive()) failure()
                        }

                        override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                            view?.destroy()
                            failure()
                            return true
                        }
                    }
                    loadUrl(document.url)
                }
            },
            onRelease = { view ->
                view.stopLoading()
                WebViewCompat.removeWebMessageListener(view, "OfflineBridge")
                view.destroy()
            }
        )
    }
}
