package com.qcksys.ao3tracker

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.tooling.preview.Preview
import cafe.adriel.voyager.navigator.Navigator
import cafe.adriel.voyager.transitions.SlideTransition
import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.push.PushRepository
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.sync.SyncCoordinator
import com.qcksys.ao3tracker.di.appModule
import com.qcksys.ao3tracker.diagnostics.Diagnostics
import com.qcksys.ao3tracker.diagnostics.DiagnosticsClient
import com.qcksys.ao3tracker.diagnostics.DiagnosticsTransport
import com.qcksys.ao3tracker.ui.navigation.MainScreen
import org.koin.compose.KoinApplication
import org.koin.compose.koinInject
import org.koin.dsl.koinConfiguration

@Composable
@Preview
fun App() {
    KoinApplication(configuration = koinConfiguration { modules(appModule) }) {
        // Initialize auth state once at app startup
        val authRepository = koinInject<AuthRepository>()
        val pushRepository = koinInject<PushRepository>()
        val diagnostics = koinInject<DiagnosticsClient>()
        val diagnosticsTransport = koinInject<DiagnosticsTransport>()
        DisposableEffect(diagnostics) {
            diagnostics.capture("app_opened")
            onDispose {
                Diagnostics.uninstall(diagnostics)
                diagnostics.close()
                diagnosticsTransport.close()
            }
        }

        LaunchedEffect(Unit) {
            authRepository.initialize()
        }

        // Register push token and auto-sync when authenticated
        val authState by authRepository.authState.collectAsState()
        val appSettings = koinInject<AppSettings>()
        val syncCoordinator = koinInject<SyncCoordinator>()
        val autoSyncOnOpen by appSettings.autoSyncOnOpenEnabled.collectAsState()

        LaunchedEffect(authState) {
            if (authState is AuthState.Authenticated) {
                // Auto-sync on app open if enabled
                if (autoSyncOnOpen) {
                    syncCoordinator.requestSync(showResult = false)
                }
                pushRepository.registerTokenIfNeeded()
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
