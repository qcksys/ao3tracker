package com.qcksys.ao3tracker.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.navigator.tab.CurrentTab
import cafe.adriel.voyager.navigator.tab.LocalTabNavigator
import cafe.adriel.voyager.navigator.tab.Tab
import cafe.adriel.voyager.navigator.tab.TabNavigator
import com.qcksys.ao3tracker.ui.screens.read.ReadScreenModel
import com.qcksys.ao3tracker.diagnostics.Diagnostics
import org.koin.compose.koinInject

class MainScreen : Screen {
    @Composable
    override fun Content() {
        val readScreenModel = koinInject<ReadScreenModel>()
        val isWebViewLoading by readScreenModel.isLoading.collectAsState()

        TabNavigator(TrackTab) {
            val tabNavigator = LocalTabNavigator.current
            val pendingNavigation by NavigationState.pendingNavigation.collectAsState()
            LaunchedEffect(tabNavigator.current.key) {
                val screen = when (tabNavigator.current) {
                    ReadTab -> "read"
                    TrackTab -> "works"
                    SearchesTab -> "searches"
                    else -> "settings"
                }
                Diagnostics.capture("screen_viewed", "screen" to screen)
            }

            // Switch to the Read tab whenever an external trigger (notification,
            // Works or Searches tab click) sets a pending navigation. ReadScreen then consumes
            // the URL on its own LaunchedEffect.
            LaunchedEffect(pendingNavigation) {
                if (pendingNavigation != null && tabNavigator.current.key != ReadTab.key) {
                    tabNavigator.current = ReadTab
                }
            }

            Scaffold(
                bottomBar = {
                    AppNavigationBar(isWebViewLoading)
                }
            ) { paddingValues ->
                Box(modifier = Modifier.padding(PaddingValues(bottom = paddingValues.calculateBottomPadding()))) {
                    CurrentTab()
                }
            }
        }
    }
}

@Composable
internal fun AppNavigationBar(isWebViewLoading: Boolean) {
    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface
    ) {
        TabNavigationItem(ReadTab, isWebViewLoading)
        TabNavigationItem(TrackTab, false)
        TabNavigationItem(SearchesTab, false)
        TabNavigationItem(SettingsTab, false)
    }
}

@Composable
private fun RowScope.TabNavigationItem(tab: Tab, showLoading: Boolean) {
    val tabNavigator = LocalTabNavigator.current
    val isSelected = tabNavigator.current.key == tab.key

    NavigationBarItem(
        selected = isSelected,
        onClick = {
            if (isSelected) {
                // If already on this tab, perform tab-specific action
                when (tab) {
                    ReadTab -> NavigationState.triggerReadTabHome()
                    TrackTab -> NavigationState.popTrackTabToRoot()
                }
            } else {
                tabNavigator.current = tab
            }
        },
        icon = {
            if (showLoading && isSelected) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp
                )
            } else {
                tab.options.icon?.let { painter ->
                    Icon(
                        painter = painter,
                        contentDescription = tab.options.title
                    )
                }
            }
        },
        label = { Text(tab.options.title) }
    )
}
