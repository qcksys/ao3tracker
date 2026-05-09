package com.qcksys.ao3tracker

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application

fun main() {
    // Initialize Sentry before starting the application
    initializeSentry(
        dsn = SentryConfig.dsn,
        isDebug = SentryConfig.isDebug,
        environment = if (SentryConfig.isDebug) "development" else "production"
    )

    application {
        Window(
            onCloseRequest = ::exitApplication,
            title = "AO3 Tracker",
        ) {
            App()
        }
    }
}
