package com.qcksys.ao3tracker.ui.components

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/** Creates a document whose name and MIME type are chosen at launch. */
private class CreateDocument : ActivityResultContract<Pair<String, String>, Uri?>() {
    override fun createIntent(context: Context, input: Pair<String, String>): Intent =
        Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(input.second)
            .putExtra(Intent.EXTRA_TITLE, input.first)

    override fun parseResult(resultCode: Int, intent: Intent?): Uri? = intent?.takeIf { resultCode == Activity.RESULT_OK }?.data
}

@Composable
internal actual fun rememberCreateDocumentLauncher(onResult: (document: String?) -> Unit): (name: String, mimeType: String) -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(CreateDocument()) { onResult(it?.toString()) }
    return { name, mimeType -> launchPicker(context, onResult) { launcher.launch(name to mimeType) } }
}

@Composable
internal actual fun rememberOpenDocumentLauncher(onResult: (document: String?) -> Unit): (mimeTypes: List<String>) -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { onResult(it?.toString()) }
    return { mimeTypes -> launchPicker(context, onResult) { launcher.launch(mimeTypes.toTypedArray()) } }
}

// Some devices, such as TVs, have no document picker.
private fun launchPicker(context: Context, onResult: (String?) -> Unit, launch: () -> Unit) {
    try {
        launch()
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "This device has no file picker.", Toast.LENGTH_LONG).show()
        onResult(null)
    }
}
