package com.qcksys.ao3tracker.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import java.lang.ref.WeakReference

private var contextRef: WeakReference<Context>? = null

fun initializeShareHelper(context: Context) {
    contextRef = WeakReference(context.applicationContext)
}

actual fun shareText(text: String, filename: String, mimeType: String) {
    val context = contextRef?.get() ?: return

    try {
        // Create a temporary file in cache directory
        val cacheDir = File(context.cacheDir, "exports")
        cacheDir.mkdirs()
        val file = File(cacheDir, filename)
        file.writeText(text)

        // Get content URI via FileProvider
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )

        // Create share intent
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val chooserIntent = Intent.createChooser(shareIntent, "Export Data").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooserIntent)
    } catch (e: Exception) {
        AppLogger.e("Failed to share file: ${e.message}", "ShareHelper", e)
    }
}
