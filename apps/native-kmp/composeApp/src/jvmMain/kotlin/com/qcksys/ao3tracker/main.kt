package com.qcksys.ao3tracker

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import com.posthog.kmp.PostHogContext
import com.qcksys.ao3tracker.diagnostics.PostHogCrashReporter
import ao3tracker.composeapp.generated.resources.Res
import ao3tracker.composeapp.generated.resources.app_logo
import org.jetbrains.compose.resources.painterResource

fun main() {
    PostHogCrashReporter.initialize(PostHogContext())

    application {
        Window(
            onCloseRequest = ::exitApplication,
            title = "AO3 Tracker",
            icon = painterResource(Res.drawable.app_logo),
        ) {
            App()
        }
    }
}
