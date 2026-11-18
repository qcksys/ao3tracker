package com.qcksys.ao3tracker.data.offline

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FilterOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipException
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import kotlin.time.Instant

/** [output] for a writer that closes its stream when done, leaving [output] itself open. */
internal fun openStream(output: OutputStream): OutputStream = object : FilterOutputStream(output) {
    override fun write(b: ByteArray, off: Int, len: Int) = out.write(b, off, len)
    override fun close() = flush()
}

/** Writes [snapshot] as an app archive for [importArchive]. Chapters with missing or damaged files are left out. */
internal fun writeOfflineArchive(snapshot: OfflineExportSnapshot, output: OutputStream, exportedAt: Instant): OfflineExportSummary =
    ZipOutputStream(openStream(output)).use { zip -> writeOfflineArchive(snapshot, zip, exportedAt) }

private fun writeOfflineArchive(snapshot: OfflineExportSnapshot, zip: ZipOutputStream, exportedAt: Instant): OfflineExportSummary {
    val written = mutableSetOf<String>()
    fun write(hash: String, bytes: ByteArray) {
        if (!written.add(hash)) return
        zip.putNextEntry(ZipEntry(offlineArchiveFile(hash)))
        zip.write(bytes)
        zip.closeEntry()
    }
    val skins = linkedMapOf<String, OfflineArchiveSkin>()
    var skipped = 0
    val works = snapshot.works.mapNotNull { work ->
        val saved = work.chapters.mapNotNull { chapter ->
            val exported = snapshot.read(chapter)
            val resources = exported?.resources?.filter { it.hash !in written }?.map { it to snapshot.resource(it) }
            if (exported == null || resources == null || resources.any { it.second == null }) {
                skipped++
                return@mapNotNull null
            }
            write(chapter.file, exported.pageFile)
            write(exported.skin.file, exported.skinFile)
            resources.forEach { (resource, bytes) -> write(resource.hash, bytes!!) }
            skins[exported.skin.hash] = exported.skin
            OfflineArchiveChapter(chapter.chapterId, chapter.file, exported.skin.hash, chapter.resources, chapter.savedAt)
        }
        saved.takeIf { it.isNotEmpty() }?.let { OfflineArchiveWork(work.workId, work.title, it) }
    }
    val manifest = OfflineArchiveManifest(OFFLINE_ARCHIVE_FORMAT, OFFLINE_ARCHIVE_VERSION, exportedAt.toString(), works, skins.values.toList())
    zip.putNextEntry(ZipEntry(OFFLINE_ARCHIVE_MANIFEST))
    zip.write(offlineJson.encodeToString(manifest).encodeToByteArray())
    zip.closeEntry()
    return OfflineExportSummary(works.size, works.sumOf { it.saved.size }, skipped)
}

/**
 * An app archive in [file]. Entries are read only up to their declared sizes, which together may be at most
 * [expansion] times the file's size, so a small file cannot expand to fill the device.
 */
internal class ZipOfflineArchive(file: File, expansion: Long = 32) : OfflineArchiveReader, AutoCloseable {
    private val zip = try {
        ZipFile(file)
    } catch (_: ZipException) {
        throw OfflineArchiveInvalid("This file is not an export of downloaded works.")
    }

    init {
        val expanded = zip.entries().asSequence().sumOf { if (it.size < 0) Long.MAX_VALUE / 2 else it.size }
        if (expanded > maxOf(file.length(), 2L * 1024 * 1024) * expansion) {
            zip.close()
            throw OfflineArchiveInvalid("This export is damaged and cannot be imported.")
        }
    }

    override fun read(name: String, limit: Int): ByteArray? {
        val entry = zip.getEntry(name)?.takeIf { !it.isDirectory && it.size in 0..limit } ?: return null
        return try {
            zip.getInputStream(entry).use { readLimited(it, entry.size.toInt()) }
        } catch (_: IOException) {
            null
        }
    }

    override fun close() = zip.close()
}

private fun readLimited(input: InputStream, limit: Int): ByteArray? {
    val buffer = ByteArrayOutputStream()
    val chunk = ByteArray(64 * 1024)
    while (true) {
        val read = input.read(chunk)
        if (read < 0) return buffer.toByteArray()
        if (buffer.size() + read > limit) return null
        buffer.write(chunk, 0, read)
    }
}

/**
 * Reads and writes the documents behind [open] and [create]. An export that fails or holds no chapters is removed
 * with [delete]. An imported archive is first copied to a temporary file from [temporaryFile], because a ZIP file is
 * read from its end.
 */
internal class StreamOfflineDocuments(
    private val create: (document: String) -> OutputStream,
    private val open: (document: String) -> InputStream,
    private val delete: (document: String) -> Unit,
    private val temporaryFile: () -> File
) : OfflineDocuments {
    override suspend fun export(document: String, format: OfflineExportFormat, snapshot: OfflineExportSnapshot, exportedAt: Instant) =
        withContext(Dispatchers.IO) {
            val summary = try {
                create(document).buffered().use { output ->
                    when (format) {
                        OfflineExportFormat.Archive -> writeOfflineArchive(snapshot, output, exportedAt)
                        OfflineExportFormat.Epub -> writeOfflineEpubs(snapshot, output, exportedAt)
                    }
                }
            } catch (error: Throwable) {
                withContext(NonCancellable) { runCatching { delete(document) } }
                throw error
            }
            if (summary.chapters == 0) runCatching { delete(document) }
            summary
        }

    override suspend fun <T> import(document: String, block: suspend (OfflineArchiveReader) -> T): T {
        val file = withContext(Dispatchers.IO) { temporaryFile() }
        try {
            withContext(Dispatchers.IO) { open(document).use { input -> file.outputStream().use { input.copyTo(it) } } }
            return ZipOfflineArchive(file).use { block(it) }
        } finally {
            withContext(NonCancellable + Dispatchers.IO) { file.delete() }
        }
    }
}
