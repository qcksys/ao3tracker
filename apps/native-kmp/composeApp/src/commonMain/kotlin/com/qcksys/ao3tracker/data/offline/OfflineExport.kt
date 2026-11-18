package com.qcksys.ao3tracker.data.offline

import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Instant

/**
 * An app archive of downloaded works is a ZIP file holding [OFFLINE_ARCHIVE_MANIFEST] and each saved file under
 * [offlineArchiveFile], named by its hash: chapter pages and skins as stored on the device, and their resources.
 */
internal const val OFFLINE_ARCHIVE_FORMAT = "ao3tracker-downloaded-works"
internal const val OFFLINE_ARCHIVE_VERSION = 1
internal const val OFFLINE_ARCHIVE_MANIFEST = "manifest.json"
private const val OFFLINE_ARCHIVE_CHAPTER_LIMIT = 100_000
// Bounds the manifest, chapter and skin files read from an archive. Saved chapter HTML is limited to 8 MiB at capture.
private const val OFFLINE_ARCHIVE_FILE_LIMIT = 16 * 1024 * 1024

internal fun offlineArchiveFile(hash: String) = "files/$hash"

internal enum class OfflineExportFormat { Archive, Epub }

@Serializable
internal data class OfflineArchiveManifest(
    val format: String,
    val version: Int,
    val exportedAt: String,
    val works: List<OfflineArchiveWork>,
    val skins: List<OfflineArchiveSkin>
)

@Serializable
internal data class OfflineArchiveWork(val workId: Long, val title: String, val saved: List<OfflineArchiveChapter>)

@Serializable
internal data class OfflineArchiveChapter(
    val chapterId: Long,
    val file: String,
    val skin: String,
    val resources: List<OfflineResource>,
    val savedAt: Long
)

@Serializable
internal data class OfflineArchiveSkin(val hash: String, val file: String, val resources: List<OfflineResource>)

@Serializable
private data class OfflineArchiveHeader(val format: String, val version: Int)

// Archives from newer releases may add fields; files this release cannot read need a new archive version.
private val archiveJson = Json { ignoreUnknownKeys = true }

internal data class OfflineExportWork(val workId: Long, val title: String, val chapters: List<OfflineExportChapter>)

/** A saved chapter to export, with the skins it can be read with, preferred first. */
internal data class OfflineExportChapter(
    val chapterId: Long,
    val file: String,
    val resources: List<OfflineResource>,
    val skins: List<OfflineArchiveSkin>,
    val savedAt: Long
)

/** A saved chapter whose page and skin files were read and verified. */
internal class OfflineExportedChapter(
    val chapter: OfflineExportChapter,
    val page: OfflinePage,
    val pageFile: ByteArray,
    val skin: OfflineArchiveSkin,
    val skinFile: ByteArray
) {
    val resources: List<OfflineResource> get() = (chapter.resources + skin.resources).distinctBy { it.hash }
}

internal data class OfflineExportSummary(val works: Int, val chapters: Int, val skipped: Int)

/**
 * Saved works read for an export. Their files stay on the device until the snapshot is closed, even when the works
 * are removed meanwhile. A missing or damaged file reads as null.
 */
internal class OfflineExportSnapshot(
    val works: List<OfflineExportWork>,
    private val readFile: (key: String, limit: Int) -> ByteArray?,
    private val onClose: () -> Unit
) : AutoCloseable {
    fun page(chapter: OfflineExportChapter): StoredOfflineChapter? = verified(chapter.file)?.let { decode(it) }

    fun read(chapter: OfflineExportChapter): OfflineExportedChapter? {
        val pageFile = verified(chapter.file) ?: return null
        val stored = decode<StoredOfflineChapter>(pageFile) ?: return null
        for (skin in chapter.skins) {
            val skinFile = verified(skin.file) ?: continue
            val styles = decode<StoredOfflineSkin>(skinFile)?.styles ?: continue
            if (offlineSkinHash(styles) == skin.hash) return OfflineExportedChapter(chapter, stored.page, pageFile, skin, skinFile)
        }
        return null
    }

    fun resource(resource: OfflineResource): ByteArray? = readFile(resource.hash, OFFLINE_RESOURCE_LIMIT)
        ?.takeIf { it.size.toLong() == resource.bytes && offlineResourceHash(resource.mimeType, it) == resource.hash }

    override fun close() = onClose()

    private fun verified(hash: String): ByteArray? = readFile(hash, OFFLINE_BUNDLE_LIMIT)?.takeIf { offlineSha256(it) == hash }

    private inline fun <reified T> decode(bytes: ByteArray): T? =
        runCatching { offlineJson.decodeFromString<T>(bytes.decodeToString(throwOnInvalidSequence = true)) }.getOrNull()
}

/** Reads entries of an app archive. */
internal interface OfflineArchiveReader {
    /** The named entry's bytes, or null when the archive has no such entry, it cannot be read, or it exceeds [limit] bytes. */
    fun read(name: String, limit: Int): ByteArray?
}

/** An archive that cannot be imported, with a message that can be shown to the reader. */
internal class OfflineArchiveInvalid(message: String) : Exception(message)

internal data class OfflineImportResult(val works: Int, val saved: Int, val kept: Int, val skipped: Int)

private fun count(value: Int, noun: String) = if (value == 1) "1 $noun" else "$value ${noun}s"

internal fun offlineExportMessage(summary: OfflineExportSummary): String = when {
    summary.chapters == 0 -> "None of the selected chapters could be read. Remove the works and download them again, then export them."
    summary.skipped == 0 -> "Exported ${count(summary.chapters, "chapter")} from ${count(summary.works, "work")}."
    else -> "Exported ${count(summary.chapters, "chapter")} from ${count(summary.works, "work")}. " +
        "${count(summary.skipped, "damaged chapter")} could not be read and ${if (summary.skipped == 1) "was" else "were"} left out."
}

internal fun offlineImportMessage(result: OfflineImportResult): String {
    if (result.saved + result.kept + result.skipped == 0) return "This export has no saved chapters."
    val imported = if (result.saved == 0) "No chapters were imported."
        else "Imported ${count(result.saved, "chapter")} from ${count(result.works, "work")}."
    val kept = if (result.kept == 0) "" else " Kept ${count(result.kept, "chapter")} already saved at the same or a newer revision."
    val skipped = if (result.skipped == 0) "" else " Skipped ${count(result.skipped, "damaged chapter")}."
    return imported + kept + skipped
}

/**
 * Whether a saved chapter at revision [saved] is kept rather than replaced by a copy at revision [incoming]: a copy
 * replaces it only when it is known to be newer.
 */
internal fun keepsSavedRevision(saved: String?, incoming: String?): Boolean {
    val incomingAt = incoming?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return true
    val savedAt = saved?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return false
    return savedAt >= incomingAt
}

/**
 * Saves the chapters of an app archive in [context] as pinned explicit downloads, oldest save first. A work keeps its
 * title and chapter list when they list at least as many chapters as an imported page. Chapters saved at the same or a
 * newer revision are kept; damaged chapters are skipped. Storage failures stop the import, keeping the chapters
 * already imported.
 */
internal suspend fun OfflineContentStore.importArchive(context: OfflineContext, archive: OfflineArchiveReader): OfflineImportResult {
    val text = archive.read(OFFLINE_ARCHIVE_MANIFEST, OFFLINE_ARCHIVE_FILE_LIMIT)
        ?.let { runCatching { it.decodeToString(throwOnInvalidSequence = true) }.getOrNull() }
    val header = text?.let { runCatching { archiveJson.decodeFromString<OfflineArchiveHeader>(it) }.getOrNull() }
    if (header?.format != OFFLINE_ARCHIVE_FORMAT) throw OfflineArchiveInvalid("This file is not an export of downloaded works.")
    if (header.version > OFFLINE_ARCHIVE_VERSION) {
        throw OfflineArchiveInvalid("This file was exported by a newer version of AO3 Tracker. Update the app, then import it again.")
    }
    val manifest = runCatching { archiveJson.decodeFromString<OfflineArchiveManifest>(text) }.getOrNull()
        ?.takeIf { it.version == OFFLINE_ARCHIVE_VERSION && it.works.sumOf { work -> work.saved.size } <= OFFLINE_ARCHIVE_CHAPTER_LIMIT }
        ?: throw OfflineArchiveInvalid("This export is damaged and cannot be imported.")
    val skins = manifest.skins.associateBy { it.hash }
    val existing = statuses(context).flatMap { it.snapshots }.associateBy { it.key }
    val works = mutableSetOf<Long>()
    var saved = 0
    var kept = 0
    var skipped = 0
    val chapters = manifest.works.flatMap { work -> work.saved.map { work.workId to it } }.sortedBy { it.second.savedAt }
    try {
        for ((workId, chapter) in chapters) {
            // Building the bundle only reads and validates the archive, so any failure means the chapter is damaged.
            val bundle = try {
                archiveBundle(archive, context, workId, chapter, skins)
            } catch (_: Exception) {
                null
            }
            if (bundle == null) {
                skipped++
                continue
            }
            if (existing[chapterKey(bundle.page.url, bundle.page.chapterId)]?.let { keepsSavedRevision(it.downloadUpdatedAt, bundle.page.downloadUpdatedAt) } == true) {
                kept++
                continue
            }
            val capture = beginCapture(context)
            try {
                for (resource in bundle.resources) {
                    capture.stage(resource, requireNotNull(archive.read(offlineArchiveFile(resource.hash), OFFLINE_RESOURCE_LIMIT)))
                }
                capture.publish(bundle, foreground = false, pin = true, keepLongerList = true)
                saved++
                works += workId
            } catch (_: IllegalArgumentException) {
                skipped++
            } finally {
                withContext(NonCancellable) { capture.cancel() }
            }
        }
    } finally {
        // Removes the staged files of skipped chapters, and of a chapter that a failure interrupted.
        withContext(NonCancellable) { collectUnusedFiles() }
    }
    return OfflineImportResult(works.size, saved, kept, skipped)
}

private fun archiveBundle(
    archive: OfflineArchiveReader,
    context: OfflineContext,
    workId: Long,
    chapter: OfflineArchiveChapter,
    skins: Map<String, OfflineArchiveSkin>
): OfflineBundle {
    val stored = archiveJson.decodeFromString<StoredOfflineChapter>(archiveText(archive, chapter.file))
    val skin = requireNotNull(skins[chapter.skin])
    val skinData = archiveJson.decodeFromString<StoredOfflineSkin>(archiveText(archive, skin.file))
    require(offlineSkinHash(skinData.styles) == skin.hash)
    val page = stored.page
    require(page.version == 1 && page.representation == "chapter" && page.workId == workId.toString() &&
        page.chapterId == chapter.chapterId.toString())
    val location = offlineLocation(page.url)
    require(location.workId == page.workId && location.representation == "chapter" && (location.chapterId ?: page.chapterId) == page.chapterId)
    require(page.chapters.all { offlineLocation(it.url).workId == page.workId })
    return OfflineBundle(
        page.copy(ao3Identity = context.identity, canSelectSkin = false, siteStyles = skinData.styles),
        skin.hash,
        (chapter.resources + skin.resources).distinctBy { it.hash },
        (stored.missingResources + skinData.missingResources).distinct()
    )
}

private fun archiveText(archive: OfflineArchiveReader, hash: String): String {
    val bytes = requireNotNull(archive.read(offlineArchiveFile(hash), OFFLINE_ARCHIVE_FILE_LIMIT))
    require(offlineSha256(bytes) == hash)
    return requireNotNull(runCatching { bytes.decodeToString(throwOnInvalidSequence = true) }.getOrNull())
}
