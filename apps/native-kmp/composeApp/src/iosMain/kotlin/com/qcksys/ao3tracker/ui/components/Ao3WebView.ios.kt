package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.interop.UIKitView
import com.qcksys.ao3tracker.webview.Ao3TrackingScript
import com.qcksys.ao3tracker.webview.ScrollRestoreScriptGenerated
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.flow.SharedFlow
import platform.Foundation.NSMutableURLRequest
import platform.Foundation.NSURL
import platform.WebKit.WKNavigation
import platform.WebKit.WKNavigationDelegateProtocol
import platform.WebKit.WKScriptMessage
import platform.WebKit.WKScriptMessageHandlerProtocol
import platform.WebKit.WKUserContentController
import platform.WebKit.WKUserScript
import platform.WebKit.WKUserScriptInjectionTime
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration
import platform.WebKit.WKWebsiteDataStore
import platform.darwin.NSObject

@OptIn(ExperimentalForeignApi::class)
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
    var webViewRef by remember { mutableStateOf<WKWebView?>(null) }

    LaunchedEffect(jsInjectionFlow, webViewRef) {
        val view = webViewRef ?: return@LaunchedEffect
        jsInjectionFlow?.collect { script ->
            view.evaluateJavaScript(script, null)
        }
    }

    val messageHandler = remember {
        object : NSObject(), WKScriptMessageHandlerProtocol {
            override fun userContentController(
                userContentController: WKUserContentController,
                didReceiveScriptMessage: WKScriptMessage
            ) {
                val body = didReceiveScriptMessage.body as? String ?: return
                onMessage(body)
            }
        }
    }

    val navigationDelegate = remember {
        object : NSObject(), WKNavigationDelegateProtocol {
            override fun webView(webView: WKWebView, didFinishNavigation: WKNavigation?) {
                onLoadingStateChange(false)
                onNavigationStateChange(webView.canGoBack, webView.canGoForward)
                webView.URL?.absoluteString?.let { onUrlChange(it) }
                // Inject tracking script
                webView.evaluateJavaScript(Ao3TrackingScript.script, null)
                // Inject scroll restore script (reads scrollTo from URL param)
                webView.evaluateJavaScript(ScrollRestoreScriptGenerated.script, null)
            }

            override fun webView(webView: WKWebView, didStartProvisionalNavigation: WKNavigation?) {
                onLoadingStateChange(true)
                webView.URL?.absoluteString?.let { onUrlChange(it) }
            }
        }
    }

    UIKitView(
        factory = {
            val configuration = WKWebViewConfiguration().apply {
                // Use persistent (default) data store for cookie persistence
                websiteDataStore = WKWebsiteDataStore.defaultDataStore()

                userContentController.apply {
                    addScriptMessageHandler(messageHandler, "ao3Handler")

                    val script = WKUserScript(
                        source = Ao3TrackingScript.script,
                        injectionTime = WKUserScriptInjectionTime.WKUserScriptInjectionTimeAtDocumentEnd,
                        forMainFrameOnly = true
                    )
                    addUserScript(script)
                }
            }

            WKWebView(frame = kotlinx.cinterop.cValue { }, configuration = configuration).apply {
                navigationDelegate = navigationDelegate
                allowsBackForwardNavigationGestures = true

                val request = NSMutableURLRequest(uRL = NSURL(string = url))
                loadRequest(request)
            }.also { webViewRef = it }
        },
        modifier = modifier,
        update = { webView ->
            val currentUrl = webView.URL?.absoluteString
            if (currentUrl != url && url.isNotBlank()) {
                val request = NSMutableURLRequest(uRL = NSURL(string = url))
                webView.loadRequest(request)
            }
        }
    )
}
