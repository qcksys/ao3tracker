package com.qcksys.ao3tracker.data.offline

import java.io.File

/** Desktop documents are file paths. */
internal actual fun getOfflineDocuments(): OfflineDocuments = StreamOfflineDocuments(
    create = { File(it).outputStream() },
    open = { File(it).inputStream() },
    delete = { File(it).delete() },
    temporaryFile = { File.createTempFile("ao3tracker-import-", ".zip") }
)
