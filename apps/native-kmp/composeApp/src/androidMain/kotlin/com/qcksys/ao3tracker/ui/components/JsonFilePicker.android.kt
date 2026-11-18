package com.qcksys.ao3tracker.ui.components

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Some file providers label .json files as plain text or binary.
private val JSON_MIME_TYPES = arrayOf("application/json", "text/plain", "application/octet-stream")

@Composable
actual fun rememberJsonFilePicker(onPicked: (Result<String>) -> Unit): (() -> Unit)? {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentOnPicked by rememberUpdatedState(onPicked)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val text = try {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use { it.readBytes().decodeToString() }
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
    return remember(launcher) { { launcher.launch(JSON_MIME_TYPES) } }
}
