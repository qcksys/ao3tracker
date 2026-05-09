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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.qcksys.ao3tracker.webview.Ao3TrackingScript
import com.qcksys.ao3tracker.webview.ScrollRestoreScriptGenerated

@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun Ao3WebView(
    url: String,
    modifier: Modifier,
    onNavigationStateChange: (canGoBack: Boolean, canGoForward: Boolean) -> Unit,
    onUrlChange: (String) -> Unit,
    onMessage: (String) -> Unit,
    onLoadingStateChange: (isLoading: Boolean) -> Unit
) {
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }

    // Handle back gesture/button - pass to WebView if it can go back
    BackHandler(enabled = canGoBack) {
        webViewRef?.goBack()
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
                            onMessage(message)
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
                            val viewCanGoBack = it.canGoBack()
                            canGoBack = viewCanGoBack
                            onNavigationStateChange(viewCanGoBack, it.canGoForward())
                            // Inject tracking script
                            it.evaluateJavascript(Ao3TrackingScript.script, null)
                            // Inject scroll restore script (reads scrollTo from URL param)
                            it.evaluateJavascript(ScrollRestoreScriptGenerated.script, null)
                        }
                    }

                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): Boolean {
                        // Allow navigation within AO3
                        val requestUrl = request?.url?.toString() ?: return false
                        return !requestUrl.contains("archiveofourown.org")
                    }
                }

                webChromeClient = WebChromeClient()

                loadUrl(url)
            }.also { webViewRef = it }
        },
        modifier = modifier,
        update = { webView ->
            if (webView.url != url && url.isNotBlank()) {
                webView.loadUrl(url)
            }
        }
    )
}
