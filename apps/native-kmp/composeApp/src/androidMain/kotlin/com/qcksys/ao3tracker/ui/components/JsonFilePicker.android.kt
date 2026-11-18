package com.qcksys.ao3tracker.ui.components

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Some file providers label .json files as plain text or binary.
private val JSON_MIME_TYPES = listOf("application/json", "text/plain", "application/octet-stream")

@Composable
actual fun rememberJsonFilePicker(onPicked: (Result<String>) -> Unit): (() -> Unit)? {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentOnPicked by rememberUpdatedState(onPicked)
    // The shared launcher reports a missing file picker (some TVs) instead of crashing.
    val open = rememberOpenDocumentLauncher { document ->
        if (document == null) return@rememberOpenDocumentLauncher
        scope.launch {
            val text = try {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(Uri.parse(document))?.use { it.readBytes().decodeToString() }
                        ?: error("Could not open the file")
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                currentOnPicked(Result.failure(error))
                return@launch
            }
            currentOnPicked(Result.success(text))
        }
    }
    return { open(JSON_MIME_TYPES) }
}
