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
import org.koin.compose.koinInject

class MainScreen : Screen {
    @Composable
    override fun Content() {
        val readScreenModel = koinInject<ReadScreenModel>()
        val isWebViewLoading by readScreenModel.isLoading.collectAsState()

        TabNavigator(TrackTab) {
            Scaffold(
                bottomBar = {
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface,
                        contentColor = MaterialTheme.colorScheme.onSurface
                    ) {
                        TabNavigationItem(ReadTab, isWebViewLoading)
                        TabNavigationItem(TrackTab, false)
                        TabNavigationItem(SettingsTab, false)
                    }
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
