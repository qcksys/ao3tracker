package com.qcksys.ao3tracker.ui.components

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebResourceError
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.qcksys.ao3tracker.webview.Ao3TrackingScript
import com.qcksys.ao3tracker.webview.ScrollRestoreScriptGenerated
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import com.qcksys.ao3tracker.webview.guardAo3Script
import kotlinx.coroutines.flow.SharedFlow
import com.qcksys.ao3tracker.data.offline.OfflineCaptureRequest
import com.qcksys.ao3tracker.data.offline.OfflinePageObservation
import com.qcksys.ao3tracker.data.offline.parseOfflineObservation
import com.qcksys.ao3tracker.webview.OfflineObservationScriptGenerated

@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun Ao3WebView(
    url: String,
    modifier: Modifier,
    onNavigationStateChange: (canGoBack: Boolean, canGoForward: Boolean) -> Unit,
    onUrlChange: (String) -> Unit,
    onMessage: (String) -> Unit,
    onLoadingStateChange: (isLoading: Boolean) -> Unit,
    onBackAtRoot: () -> Unit,
    jsInjectionFlow: SharedFlow<String>?,
    pageScript: String?,
    onLinkAction: (ReaderLinkAction) -> Unit,
    offlineCapture: OfflineCaptureRequest?,
    onOfflinePage: (OfflinePageObservation) -> Unit,
    onLoadFailure: (Int?, String?) -> Unit,
    onNavigate: (String) -> Boolean,
    onBack: () -> Boolean
) {
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var selectedLink by remember { mutableStateOf<ReaderLink?>(null) }
    val onBackAtRootState by rememberUpdatedState(onBackAtRoot)
    val captureScope = rememberCoroutineScope()
    var captureConnection by remember { mutableStateOf<OfflineCaptureConnection?>(null) }
    var loadedUrl by remember { mutableStateOf<String?>(null) }
    val onOfflinePageState by rememberUpdatedState(onOfflinePage)
    val onLoadFailureState by rememberUpdatedState(onLoadFailure)
    val onNavigateState by rememberUpdatedState(onNavigate)
    val onBackState by rememberUpdatedState(onBack)
    var documentVersion by remember { mutableStateOf(0L) }
    var released by remember { mutableStateOf(false) }

    LaunchedEffect(offlineCapture, loadedUrl, captureConnection) {
        if (offlineCapture != null && loadedUrl != null) captureConnection?.start(offlineCapture)
        else captureConnection?.cancel()
    }

    LaunchedEffect(url) { selectedLink = null }

    selectedLink?.let { link ->
        ReaderLinkSheet(
            link = link,
            onDismiss = { selectedLink = null },
            onCopy = { webViewRef?.copyLink(link) },
            onOpenInBrowser = { webViewRef?.openLinkInBrowser(link) },
            onAction = onLinkAction
        )
    }

    // Always handle back: WebView goes back if possible, otherwise notify caller
    BackHandler(enabled = pageScript == null) {
        val view = webViewRef
        if (onBackState()) return@BackHandler
        if (view != null && view.canGoBack()) {
            view.goBack()
        } else {
            onBackAtRootState()
        }
    }

    // Forward JS injection requests to the live WebView
    LaunchedEffect(jsInjectionFlow, webViewRef) {
        val view = webViewRef ?: return@LaunchedEffect
        jsInjectionFlow?.collect { script ->
            if (isTrustedAo3Url(view.url)) view.evaluateJavascript(guardAo3Script(script), null)
        }
    }

    // Ensure cookies are persisted when composable leaves composition
    DisposableEffect(Unit) {
        onDispose {
            CookieManager.getInstance().flush()
        }
    }

    AndroidView(
        factory = { context ->
            // Configure CookieManager for persistent cookies
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(WebView(context), true)
            }

            Ao3PageWebView(context).apply {
                captureConnection = OfflineCaptureConnection(this, captureScope)
                // Enable third-party cookies for this WebView instance
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    loadWithOverviewMode = true
                    useWideViewPort = true
                    builtInZoomControls = true
                    displayZoomControls = false
                    setSupportZoom(true)
                }

                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun postMessage(message: String) {
                            post {
                                if (!released && isTrustedAo3Url(this@apply.url)) onMessage(message)
                            }
                        }
                    },
                    "AndroidBridge"
                )

                webViewClient = object : WebViewClient() {
                    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                        if (request?.isForMainFrame == true) onLoadFailureState(null, null)
                    }

                    override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, response: WebResourceResponse?) {
                        if (request?.isForMainFrame == true) onLoadFailureState(response?.statusCode,
                            response?.responseHeaders?.entries?.firstOrNull { it.key.equals("Retry-After", true) }?.value)
                    }

                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                        if (released) return
                        super.onPageStarted(view, url, favicon)
                        loadedUrl = null
                        documentVersion++
                        captureConnection?.cancel()
                        onLoadingStateChange(true)
                        url?.let { onUrlChange(it) }
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        if (released) return
                        super.onPageFinished(view, url)
                        onLoadingStateChange(false)
                        loadedUrl = url?.takeIf { isTrustedAo3Url(it) }
                        view?.let {
                            onNavigationStateChange(it.canGoBack(), it.canGoForward())
                            // Only inject scripts on real AO3 pages
                            if (isTrustedAo3Url(url)) {
                                if (pageScript != null) {
                                    it.evaluateJavascript(guardAo3Script(pageScript), null)
                                } else {
                                    val source = it.url
                                    val version = documentVersion
                                    it.evaluateJavascript(guardAo3Script("${OfflineObservationScriptGenerated.script}; return Ao3OfflineObservation.observe(document, location.href);")) { body ->
                                        if (documentVersion == version && source != null && it.url == source) {
                                            parseOfflineObservation(body, source)?.let(onOfflinePageState)
                                        }
                                    }
                                    it.evaluateJavascript(Ao3TrackingScript.script, null)
                                    it.evaluateJavascript(ScrollRestoreScriptGenerated.script, null)
                                }
                            }
                        }
                    }

                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): Boolean {
                        // Only allow navigation within AO3; override (block) everything else
                        val target = request?.url?.toString() ?: return true
                        if (!isTrustedAo3Url(target)) return true
                        return request.isForMainFrame && request.method == "GET" && onNavigateState(target)
                    }
                }

                webChromeClient = WebChromeClient()
                installLinkContextMenu { selectedLink = it }

                if (isTrustedAo3Url(url)) loadUrl(url)
            }.also { webViewRef = it }
        },
        modifier = modifier,
        onRelease = { webView ->
            released = true
            documentVersion++
            webView.stopLoading()
            captureConnection?.close()
            captureConnection = null
            webView.removeJavascriptInterface("AndroidBridge")
            webView.destroy()
        },
        update = { webView ->
            if (webView.url != url && isTrustedAo3Url(url)) {
                webView.loadUrl(url)
            }
        }
    )
}
