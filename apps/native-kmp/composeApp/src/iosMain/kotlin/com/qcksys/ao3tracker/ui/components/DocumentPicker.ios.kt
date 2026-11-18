package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable

// iOS has no offline reading yet, so nothing offers these pickers.
@Composable
internal actual fun rememberCreateDocumentLauncher(onResult: (document: String?) -> Unit): (name: String, mimeType: String) -> Unit =
    { _, _ -> onResult(null) }

@Composable
internal actual fun rememberOpenDocumentLauncher(onResult: (document: String?) -> Unit): (mimeTypes: List<String>) -> Unit =
    { onResult(null) }
