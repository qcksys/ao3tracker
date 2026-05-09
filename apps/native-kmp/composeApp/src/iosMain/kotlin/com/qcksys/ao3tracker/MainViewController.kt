package com.qcksys.ao3tracker

import androidx.compose.ui.window.ComposeUIViewController

fun MainViewController(): androidx.compose.ui.uikit.UIViewController {
    // Initialize Sentry before creating the UI
    initializeSentry(
        dsn = SentryConfig.dsn,
        isDebug = SentryConfig.isDebug,
        environment = "production"
    )
    return ComposeUIViewController { App() }
}
