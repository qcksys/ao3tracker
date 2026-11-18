package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable

/** Returns an action that opens the platform file picker and reads the chosen file, or null where unsupported. */
@Composable
expect fun rememberJsonFilePicker(onPicked: (Result<String>) -> Unit): (() -> Unit)?
