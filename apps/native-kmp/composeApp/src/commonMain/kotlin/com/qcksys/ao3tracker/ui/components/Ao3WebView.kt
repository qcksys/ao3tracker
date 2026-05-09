package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
expect fun Ao3WebView(
    url: String,
    modifier: Modifier = Modifier,
    onNavigationStateChange: (canGoBack: Boolean, canGoForward: Boolean) -> Unit = { _, _ -> },
    onUrlChange: (String) -> Unit = {},
    onMessage: (String) -> Unit = {},
    onLoadingStateChange: (isLoading: Boolean) -> Unit = {}
)

interface WebViewNavigator {
    fun goBack()
    fun goForward()
    fun refresh()
    fun loadUrl(url: String)
}
