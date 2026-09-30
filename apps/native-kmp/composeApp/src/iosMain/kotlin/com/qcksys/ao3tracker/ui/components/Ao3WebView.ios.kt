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
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import com.qcksys.ao3tracker.webview.isTrustedAo3Origin
import com.qcksys.ao3tracker.webview.guardAo3Script
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.flow.SharedFlow
import platform.Foundation.NSMutableURLRequest
import platform.Foundation.NSURL
import platform.WebKit.WKNavigation
import platform.WebKit.WKNavigationAction
import platform.WebKit.WKNavigationActionPolicy
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
            if (isTrustedAo3Url(view.URL?.absoluteString)) {
                view.evaluateJavaScript(guardAo3Script(script), null)
            }
        }
    }

    val messageHandler = remember {
        object : NSObject(), WKScriptMessageHandlerProtocol {
            override fun userContentController(
                userContentController: WKUserContentController,
                didReceiveScriptMessage: WKScriptMessage
            ) {
                val frame = didReceiveScriptMessage.frameInfo
                val origin = frame.securityOrigin
                if (!frame.mainFrame || !isTrustedAo3Origin(origin.protocol, origin.host, origin.port)) return
                if (!isTrustedAo3Url(didReceiveScriptMessage.webView?.URL?.absoluteString)) return
                val body = didReceiveScriptMessage.body as? String ?: return
                onMessage(body)
            }
        }
    }

    val navigationDelegate = remember {
        object : NSObject(), WKNavigationDelegateProtocol {
            override fun webView(
                webView: WKWebView,
                decidePolicyForNavigationAction: WKNavigationAction,
                decisionHandler: (WKNavigationActionPolicy) -> Unit
            ) {
                decisionHandler(
                    if (isTrustedAo3Url(decidePolicyForNavigationAction.request.URL?.absoluteString))
                        WKNavigationActionPolicy.WKNavigationActionPolicyAllow
                    else WKNavigationActionPolicy.WKNavigationActionPolicyCancel
                )
            }

            override fun webView(webView: WKWebView, didFinishNavigation: WKNavigation?) {
                onLoadingStateChange(false)
                onNavigationStateChange(webView.canGoBack, webView.canGoForward)
                webView.URL?.absoluteString?.let { onUrlChange(it) }
                // Inject tracking script
                if (!isTrustedAo3Url(webView.URL?.absoluteString)) return
                webView.evaluateJavaScript(guardAo3Script(Ao3TrackingScript.script), null)
                // Inject scroll restore script (reads scrollTo from URL param)
                webView.evaluateJavaScript(guardAo3Script(ScrollRestoreScriptGenerated.script), null)
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
                        source = guardAo3Script(Ao3TrackingScript.script),
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
                if (isTrustedAo3Url(url)) loadRequest(request)
            }.also { webViewRef = it }
        },
        modifier = modifier,
        update = { webView ->
            val currentUrl = webView.URL?.absoluteString
            if (currentUrl != url && isTrustedAo3Url(url)) {
                val request = NSMutableURLRequest(uRL = NSURL(string = url))
                webView.loadRequest(request)
            }
        }
    )
}
