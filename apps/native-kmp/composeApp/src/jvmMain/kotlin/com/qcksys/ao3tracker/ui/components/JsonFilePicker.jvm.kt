package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable

@Composable
actual fun rememberJsonFilePicker(onPicked: (Result<String>) -> Unit): (() -> Unit)? = null
