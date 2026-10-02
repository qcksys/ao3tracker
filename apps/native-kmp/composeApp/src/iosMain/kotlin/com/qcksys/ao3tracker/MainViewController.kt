package com.qcksys.ao3tracker

import androidx.compose.ui.window.ComposeUIViewController
import com.posthog.kmp.PostHogContext
import com.qcksys.ao3tracker.diagnostics.PostHogCrashReporter

fun MainViewController(): androidx.compose.ui.uikit.UIViewController {
    PostHogCrashReporter.initialize(PostHogContext())
    return ComposeUIViewController { App() }
}
