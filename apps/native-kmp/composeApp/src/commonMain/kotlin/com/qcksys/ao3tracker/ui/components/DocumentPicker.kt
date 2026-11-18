package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable

/**
 * Returns a function that opens the platform's picker to create a document with a suggested name and MIME type.
 * [onResult] receives the chosen document, or null when the picker is cancelled.
 */
@Composable
internal expect fun rememberCreateDocumentLauncher(onResult: (document: String?) -> Unit): (name: String, mimeType: String) -> Unit

/**
 * Returns a function that opens the platform's picker to choose an existing document of the given MIME types.
 * [onResult] receives the chosen document, or null when the picker is cancelled.
 */
@Composable
internal expect fun rememberOpenDocumentLauncher(onResult: (document: String?) -> Unit): (mimeTypes: List<String>) -> Unit
