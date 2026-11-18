package com.qcksys.ao3tracker.data.offline

import kotlin.time.Instant

/** Export files the reader chose with the platform's file picker, identified by the picker's document string. */
internal interface OfflineDocuments {
    /** Writes [snapshot] to [document] in [format]. */
    suspend fun export(document: String, format: OfflineExportFormat, snapshot: OfflineExportSnapshot, exportedAt: Instant): OfflineExportSummary

    /** Opens the app archive [document] for [block]. */
    suspend fun <T> import(document: String, block: suspend (OfflineArchiveReader) -> T): T
}

/** The platform's export files; only platforms with offline reading support them. */
internal expect fun getOfflineDocuments(): OfflineDocuments

internal object UnsupportedOfflineDocuments : OfflineDocuments {
    override suspend fun export(document: String, format: OfflineExportFormat, snapshot: OfflineExportSnapshot, exportedAt: Instant) =
        error("Offline downloads are not supported on this platform")

    override suspend fun <T> import(document: String, block: suspend (OfflineArchiveReader) -> T): T =
        error("Offline downloads are not supported on this platform")
}

internal const val OFFLINE_ARCHIVE_MIME_TYPE = "application/zip"
internal const val OFFLINE_EPUB_MIME_TYPE = "application/epub+zip"

/** File types offered when choosing an archive to import; file managers label ZIP files inconsistently. */
internal val OFFLINE_IMPORT_MIME_TYPES = listOf(OFFLINE_ARCHIVE_MIME_TYPE, "application/x-zip-compressed", "application/octet-stream")

/** The suggested file name and type of an export of [titles] in [format], made on [date] (`YYYY-MM-DD`). */
internal fun offlineExportFile(format: OfflineExportFormat, titles: List<String>, date: String): Pair<String, String> = when {
    format == OfflineExportFormat.Archive -> "ao3tracker-downloads-$date.zip" to OFFLINE_ARCHIVE_MIME_TYPE
    titles.size == 1 -> "${offlineFileName(titles.single())}.epub" to OFFLINE_EPUB_MIME_TYPE
    else -> "ao3tracker-epubs-$date.zip" to OFFLINE_ARCHIVE_MIME_TYPE
}

/** [title] as a file name: without path separators or control characters, and at most 80 characters. */
internal fun offlineFileName(title: String): String =
    title.replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1f\\x7f]"), "_").trim().trim('.').take(80).trim().ifEmpty { "Work" }
