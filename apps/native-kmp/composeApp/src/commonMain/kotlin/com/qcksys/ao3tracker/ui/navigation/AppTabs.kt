package com.qcksys.ao3tracker.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.navigator.Navigator
import cafe.adriel.voyager.navigator.tab.Tab
import cafe.adriel.voyager.navigator.tab.TabOptions
import cafe.adriel.voyager.transitions.SlideTransition
import com.qcksys.ao3tracker.ui.screens.read.ReadScreen
import com.qcksys.ao3tracker.ui.screens.settings.SettingsScreen
import com.qcksys.ao3tracker.ui.screens.track.TrackScreen

object ReadTab : Tab {
    private fun readResolve(): Any = ReadTab

    override val options: TabOptions
        @Composable
        get() {
            val icon = rememberVectorPainter(Icons.Default.Book)
            return remember {
                TabOptions(
                    index = 0u,
                    title = "Read",
                    icon = icon
                )
            }
        }

    @Composable
    override fun Content() {
        ReadScreen()
    }
}

object TrackTab : Tab {
    private fun readResolve(): Any = TrackTab

    override val options: TabOptions
        @Composable
        get() {
            val icon = rememberVectorPainter(Icons.AutoMirrored.Filled.List)
            return remember {
                TabOptions(
                    index = 1u,
                    title = "Track",
                    icon = icon
                )
            }
        }

    @Composable
    override fun Content() {
        Navigator(TrackScreenWrapper()) { navigator ->
            // Register navigator so we can pop to root when tab is re-selected
            NavigationState.registerTrackTabNavigator(NavigatorAdapter(navigator))
            SlideTransition(navigator)
        }
    }
}

/**
 * Adapter to wrap Voyager Navigator in TabNavigatorContract.
 */
private class NavigatorAdapter(private val navigator: Navigator) : TabNavigatorContract {
    override fun popToRoot() {
        navigator.popUntilRoot()
    }
}

private class TrackScreenWrapper : Screen {
    @Composable
    override fun Content() {
        TrackScreen()
    }
}

object SettingsTab : Tab {
    private fun readResolve(): Any = SettingsTab

    override val options: TabOptions
        @Composable
        get() {
            val icon = rememberVectorPainter(Icons.Default.Settings)
            return remember {
                TabOptions(
                    index = 2u,
                    title = "Settings",
                    icon = icon
                )
            }
        }

    @Composable
    override fun Content() {
        SettingsScreen()
    }
}
