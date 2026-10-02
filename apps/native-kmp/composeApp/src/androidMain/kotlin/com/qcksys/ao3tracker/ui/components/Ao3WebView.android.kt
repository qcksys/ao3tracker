package com.qcksys.ao3tracker.ui.components

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.qcksys.ao3tracker.webview.Ao3TrackingScript
import com.qcksys.ao3tracker.webview.ScrollRestoreScriptGenerated
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import com.qcksys.ao3tracker.webview.guardAo3Script
import kotlinx.coroutines.flow.SharedFlow

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
    jsInjectionFlow: SharedFlow<String>?
) {
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    val onBackAtRootState by rememberUpdatedState(onBackAtRoot)

    // Always handle back: WebView goes back if possible, otherwise notify caller
    BackHandler {
        val view = webViewRef
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

            WebView(context).apply {
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
                                if (isTrustedAo3Url(this@apply.url)) onMessage(message)
                            }
                        }
                    },
                    "AndroidBridge"
                )

                webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                        super.onPageStarted(view, url, favicon)
                        onLoadingStateChange(true)
                        url?.let { onUrlChange(it) }
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        onLoadingStateChange(false)
                        view?.let {
                            onNavigationStateChange(it.canGoBack(), it.canGoForward())
                            // Only inject scripts on real AO3 pages
                            if (isTrustedAo3Url(url)) {
                                // Inject tracking script
                                it.evaluateJavascript(Ao3TrackingScript.script, null)
                                // Inject scroll restore script (reads scrollTo from URL param)
                                it.evaluateJavascript(ScrollRestoreScriptGenerated.script, null)
                            }
                        }
                    }

                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): Boolean {
                        // Only allow navigation within AO3; override (block) everything else
                        return !isTrustedAo3Url(request?.url?.toString())
                    }
                }

                webChromeClient = WebChromeClient()
                installLinkContextMenu()

                if (isTrustedAo3Url(url)) loadUrl(url)
            }.also { webViewRef = it }
        },
        modifier = modifier,
        update = { webView ->
            if (webView.url != url && isTrustedAo3Url(url)) {
                webView.loadUrl(url)
            }
        }
    )
}
