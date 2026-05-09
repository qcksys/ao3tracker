package com.qcksys.ao3tracker

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import cafe.adriel.voyager.navigator.Navigator
import cafe.adriel.voyager.transitions.SlideTransition
import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.push.PushRepository
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.sync.SyncRepository
import com.qcksys.ao3tracker.di.appModule
import com.qcksys.ao3tracker.ui.navigation.MainScreen
import org.jetbrains.compose.ui.tooling.preview.Preview
import org.koin.compose.KoinApplication
import org.koin.compose.koinInject

@Composable
@Preview
fun App() {
    KoinApplication(application = { modules(appModule) }) {
        // Initialize auth state once at app startup
        val authRepository = koinInject<AuthRepository>()
        val pushRepository = koinInject<PushRepository>()

        LaunchedEffect(Unit) {
            authRepository.initialize()
        }

        // Register push token and auto-sync when authenticated
        val authState by authRepository.authState.collectAsState()
        val appSettings = koinInject<AppSettings>()
        val syncRepository = koinInject<SyncRepository>()
        val autoSyncOnOpen by appSettings.autoSyncOnOpenEnabled.collectAsState()

        LaunchedEffect(authState) {
            if (authState is AuthState.Authenticated) {
                pushRepository.registerTokenIfNeeded()
                // Auto-sync on app open if enabled
                if (autoSyncOnOpen) {
                    syncRepository.sync()
                }
            }
        }

        Ao3TrackerTheme {
            Navigator(MainScreen()) { navigator ->
                SlideTransition(navigator)
            }
        }
    }
}

@Composable
fun Ao3TrackerTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) {
        darkColorScheme()
    } else {
        lightColorScheme()
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
