package com.qcksys.ao3tracker.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

@Composable
actual fun Ao3WebView(
    url: String,
    modifier: Modifier,
    onNavigationStateChange: (canGoBack: Boolean, canGoForward: Boolean) -> Unit,
    onUrlChange: (String) -> Unit,
    onMessage: (String) -> Unit,
    onLoadingStateChange: (isLoading: Boolean) -> Unit
) {
    // Desktop JVM doesn't have native WebView support in Compose
    // Users can use the external browser instead
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "WebView is not available on Desktop.\nPlease use your browser to visit AO3.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
