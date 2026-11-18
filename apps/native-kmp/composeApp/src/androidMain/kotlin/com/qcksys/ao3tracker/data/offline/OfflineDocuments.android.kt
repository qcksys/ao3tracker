package com.qcksys.ao3tracker.data.offline

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import java.io.File

private lateinit var documentsContext: Context

fun initializeOfflineDocuments(context: Context) {
    documentsContext = context.applicationContext
}

internal actual fun getOfflineDocuments(): OfflineDocuments = StreamOfflineDocuments(
    create = { document ->
        val uri = Uri.parse(document)
        val resolver = documentsContext.contentResolver
        // Truncates a replaced file; some providers support only "w".
        requireNotNull(runCatching { resolver.openOutputStream(uri, "wt") }.getOrNull() ?: resolver.openOutputStream(uri, "w")) {
            "The export file could not be opened."
        }
    },
    open = { requireNotNull(documentsContext.contentResolver.openInputStream(Uri.parse(it))) { "The import file could not be opened." } },
    delete = { DocumentsContract.deleteDocument(documentsContext.contentResolver, Uri.parse(it)) },
    temporaryFile = { File.createTempFile("import-", ".zip", File(documentsContext.cacheDir, "offline-import").apply { mkdirs() }) }
)
