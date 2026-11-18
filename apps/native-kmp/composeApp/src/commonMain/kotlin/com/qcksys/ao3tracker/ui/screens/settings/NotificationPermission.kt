package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.runtime.Composable

/** Null when no platform permission request is needed. */
@Composable
internal expect fun rememberNotificationPermissionRequest(onGranted: () -> Unit): (() -> Unit)?
