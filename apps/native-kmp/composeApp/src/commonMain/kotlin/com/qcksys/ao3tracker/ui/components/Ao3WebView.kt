package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kotlinx.coroutines.flow.SharedFlow
import com.qcksys.ao3tracker.data.offline.OfflineCaptureRequest
import com.qcksys.ao3tracker.data.offline.OfflinePageObservation

@Composable
expect fun Ao3WebView(
    url: String,
    modifier: Modifier = Modifier,
    onNavigationStateChange: (canGoBack: Boolean, canGoForward: Boolean) -> Unit = { _, _ -> },
    onUrlChange: (String) -> Unit = {},
    onMessage: (String) -> Unit = {},
    onLoadingStateChange: (isLoading: Boolean) -> Unit = {},
    onBackAtRoot: () -> Unit = {},
    jsInjectionFlow: SharedFlow<String>? = null,
    pageScript: String? = null,
    onLinkAction: (ReaderLinkAction) -> Unit = {},
    offlineCapture: OfflineCaptureRequest? = null,
    onOfflinePage: (OfflinePageObservation) -> Unit = {},
    onLoadFailure: (Int?, String?) -> Unit = { _, _ -> },
    onNavigate: (String) -> Boolean = { false },
    onBack: () -> Boolean = { false }
)

interface WebViewNavigator {
    fun goBack()
    fun goForward()
    fun refresh()
    fun loadUrl(url: String)
}
