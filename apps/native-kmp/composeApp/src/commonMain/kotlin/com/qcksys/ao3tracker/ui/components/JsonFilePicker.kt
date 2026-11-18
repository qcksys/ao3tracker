package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable

/**
 * Returns an action that opens the platform file picker (through [rememberOpenDocumentLauncher]) and reads the
 * chosen file as text, or null where JSON import is unsupported.
 */
@Composable
expect fun rememberJsonFilePicker(onPicked: (Result<String>) -> Unit): (() -> Unit)?
