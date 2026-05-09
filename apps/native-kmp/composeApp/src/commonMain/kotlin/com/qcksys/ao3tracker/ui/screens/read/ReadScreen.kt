package com.qcksys.ao3tracker.ui.screens.read

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.qcksys.ao3tracker.ui.components.Ao3WebView
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import org.koin.compose.koinInject

@Composable
fun ReadScreen() {
    val screenModel = koinInject<ReadScreenModel>()
    val currentUrl by screenModel.currentUrl.collectAsState()
    val scrollProgress by screenModel.scrollProgress.collectAsState()

    // Handle pending navigation from other tabs
    val pendingNavigation by NavigationState.pendingNavigation.collectAsState()
    LaunchedEffect(pendingNavigation) {
        pendingNavigation?.let { nav ->
            screenModel.navigateToUrlWithScroll(nav.url, nav.scrollProgress)
            NavigationState.clearPendingNavigation()
        }
    }

    // Handle home navigation when Read tab is re-tapped
    val navigateToHome by NavigationState.navigateReadToHome.collectAsState()
    LaunchedEffect(navigateToHome) {
        if (navigateToHome) {
            screenModel.navigateToHome()
            NavigationState.clearReadTabHome()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        // Reading progress bar at the top
        LinearProgressIndicator(
            progress = { scrollProgress },
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.primary,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
            drawStopIndicator = {}
        )

        Ao3WebView(
            url = currentUrl,
            modifier = Modifier.fillMaxSize(),
            onNavigationStateChange = { back, forward ->
                screenModel.updateNavigationState(back, forward)
            },
            onUrlChange = { url ->
                screenModel.updateCurrentUrl(url)
            },
            onMessage = { message ->
                screenModel.handleWebViewMessage(message)
            },
            onLoadingStateChange = { isLoading ->
                screenModel.updateLoadingState(isLoading)
            }
        )
    }
}
