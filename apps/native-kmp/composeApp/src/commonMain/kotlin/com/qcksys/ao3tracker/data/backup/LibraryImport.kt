package com.qcksys.ao3tracker.data.backup

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.Ao3Database
import com.qcksys.ao3tracker.data.database.ChapterEntity
import com.qcksys.ao3tracker.data.database.TagEntity
import com.qcksys.ao3tracker.data.database.WorkEntity
import com.qcksys.ao3tracker.data.model.Chapter
import com.qcksys.ao3tracker.data.model.ExportData
import com.qcksys.ao3tracker.data.model.Work
import com.qcksys.ao3tracker.util.JsonConfig
import kotlinx.serialization.json.Json
import kotlin.time.Clock

private const val EXPORT_VERSION = 1

private val exportJson = Json {
    prettyPrint = true
    encodeDefaults = true
}

/** Encodes the library in the JSON format used by Export Data and Google Drive backups. */
fun encodeLibraryExport(data: ExportData): String = exportJson.encodeToString(ExportData.serializer(), data)

fun decodeLibraryExport(text: String): ExportData {
    val data = JsonConfig.json.decodeFromString(ExportData.serializer(), text)
    require(data.version <= EXPORT_VERSION) { "This file was made by a newer version of AO3 Tracker" }
    return data
}

enum class LibraryImportMode {
    /** Adds missing works and keeps whichever side was read more recently. Nothing is deleted. */
    MERGE,

    /** Adds works absent from the library, including deleted ones; existing works stay unchanged. */
    ADD_MISSING,

    /** Removes the library's works, then loads the file's works. */
    REPLACE
}

data class LibraryImportResult(val added: Int, val updated: Int) {
    val isEmpty: Boolean get() = added == 0 && updated == 0
}

/**
 * Imports [ExportData] into the active library as one local edit. Imported rows get a fresh
 * `rowUpdatedAt` so incremental sync uploads them; reading timestamps keep their original values.
 */
class LibraryImporter(
    private val accountData: AccountDataStore,
    /**
     * Runs the import outside any sync. A sync that started earlier would otherwise finish by saving
     * its cursors over the ones Replace resets, and the removed server works would never return.
     */
    private val betweenSyncs: suspend (suspend () -> LibraryImportResult) -> LibraryImportResult = { it() }
) {
    suspend fun import(data: ExportData, mode: LibraryImportMode, expectedOwner: String): LibraryImportResult =
        betweenSyncs { importNow(data, mode, expectedOwner) }

    private suspend fun importNow(data: ExportData, mode: LibraryImportMode, expectedOwner: String): LibraryImportResult =
        accountData.edit({ accountData.active.value?.owner == expectedOwner }) {
            val db = accountData.database
            val now = maxOf(Clock.System.now().toEpochMilliseconds(), (accountData.active.value?.localCursor ?: 0) + 1)
            if (mode == LibraryImportMode.REPLACE) clearWorks(db)
            var added = 0
            var updated = 0
            for (work in data.works) {
                if (work.rowDeletedAt != null) continue
                val local = db.workDao().getWorkByIdIncludingDeleted(work.id)
                when {
                    local == null -> {
                        insert(db, work, now)
                        added++
                    }
                    mode == LibraryImportMode.MERGE -> if (merge(db, local, work, now)) updated++
                }
            }
            LibraryImportResult(added, updated)
        }

    private suspend fun clearWorks(db: Ao3Database) {
        db.tagDao().deleteAllTags()
        db.chapterDao().deleteAllChapters()
        db.workDao().deleteAllWorks()
        // A tracker account downloads its synced works again on the next full sync.
        val active = requireNotNull(db.accountDao().getActive())
        db.accountDao().setActive(active.copy(remoteCursor = null, localCursor = null))
    }

    private suspend fun insert(db: Ao3Database, work: Work, now: Long) {
        db.workDao().upsertWork(work.toEntity(now))
        db.chapterDao().upsertChapters(work.liveChapters().map { it.toEntity(work.id, now) })
        replaceTags(db, work)
    }

    private suspend fun merge(db: Ao3Database, local: WorkEntity, work: Work, now: Long): Boolean {
        val backupRead = work.lastRead ?: 0L
        if (local.rowDeletedAt != null) {
            // Keep a deletion made after the backup's last reading.
            if ((local.lastRead ?: local.rowDeletedAt) >= backupRead) return false
            db.workDao().upsertWork(work.toEntity(now).copy(rowCreatedAt = local.rowCreatedAt))
            replaceTags(db, work)
            mergeChapters(db, work, useBackupMetadata = true, now = now)
            return true
        }

        val useBackupReading = backupRead > (local.lastRead ?: 0L)
        val useBackupMetadata = (work.lastRefreshed ?: 0L) > (local.lastRefreshed ?: 0L)
        var merged = local
        if (useBackupMetadata) {
            merged = merged.copy(
                title = work.title,
                author = work.author,
                authorUrl = work.authorUrl,
                summary = work.summary,
                language = work.language,
                wordCount = work.wordCount,
                currentChapters = work.currentChapters,
                totalChapters = work.totalChapters,
                hits = work.hits,
                kudos = work.kudos,
                bookmarks = work.bookmarks,
                comments = work.comments,
                published = work.published,
                lastUpdated = work.lastUpdated,
                lastRefreshed = work.lastRefreshed,
                downloadPath = work.downloadPath,
                downloadUpdatedAt = work.downloadUpdatedAt
            )
            replaceTags(db, work)
        }
        if (useBackupReading) {
            merged = merged.copy(
                lastRead = work.lastRead,
                markedCompleteAt = work.markedCompleteAt,
                isPrivate = work.isPrivate,
                // Explicit local timestamps win because the export format carries none for these flags.
                subscribed = if (local.subscribedUpdatedAt == null) work.subscribed else local.subscribed,
                favourite = if (local.favouriteUpdatedAt == null) work.favourite else local.favourite
            )
        }
        val chaptersChanged = mergeChapters(db, work, useBackupMetadata, now)
        val workChanged = merged != local
        if (workChanged) db.workDao().upsertWork(merged.copy(rowUpdatedAt = now))
        return workChanged || chaptersChanged
    }

    private suspend fun mergeChapters(db: Ao3Database, work: Work, useBackupMetadata: Boolean, now: Long): Boolean {
        var changed = false
        for (chapter in work.liveChapters()) {
            val local = db.chapterDao().getChapterByIdIncludingDeleted(chapter.id, work.id)
            val backupRead = chapter.lastReadAt ?: 0L
            val next = when {
                local == null -> chapter.toEntity(work.id, now)
                local.rowDeletedAt != null ->
                    if ((local.lastReadAt ?: local.rowDeletedAt) >= backupRead) null
                    else chapter.toEntity(work.id, now).copy(rowCreatedAt = local.rowCreatedAt)
                else -> {
                    val useBackupProgress = backupRead > (local.lastReadAt ?: 0L)
                    local.copy(
                        number = if (useBackupMetadata) chapter.number ?: local.number else local.number ?: chapter.number,
                        title = if (useBackupMetadata) chapter.title ?: local.title else local.title ?: chapter.title,
                        dateUpdated = if (useBackupMetadata) chapter.dateUpdated ?: local.dateUpdated else local.dateUpdated ?: chapter.dateUpdated,
                        readProgress = if (useBackupProgress) chapter.readProgress else local.readProgress,
                        lastReadAt = if (useBackupProgress) chapter.lastReadAt else local.lastReadAt,
                        markedCompleteAt = if (useBackupProgress) chapter.markedCompleteAt else local.markedCompleteAt
                    ).takeIf { it != local }?.copy(rowUpdatedAt = now)
                }
            }
            if (next != null) {
                db.chapterDao().upsertChapter(next)
                changed = true
            }
        }
        return changed
    }

    private suspend fun replaceTags(db: Ao3Database, work: Work) {
        db.tagDao().deleteTagsByWork(work.id)
        db.tagDao().upsertTags(work.tags.map { TagEntity(work.id, it.tag, it.href, it.typeId, it.rowCreatedAt) })
    }

    private fun Work.liveChapters(): List<Chapter> = chapterList.filter { it.rowDeletedAt == null }

    private fun Work.toEntity(now: Long) = WorkEntity(
        id = id,
        title = title,
        author = author,
        authorUrl = authorUrl,
        summary = summary,
        language = language,
        wordCount = wordCount,
        currentChapters = currentChapters,
        totalChapters = totalChapters,
        hits = hits,
        kudos = kudos,
        bookmarks = bookmarks,
        comments = comments,
        published = published,
        lastUpdated = lastUpdated,
        lastRefreshed = lastRefreshed,
        downloadPath = downloadPath,
        downloadUpdatedAt = downloadUpdatedAt,
        isPrivate = isPrivate,
        subscribed = subscribed,
        favourite = favourite,
        lastRead = lastRead,
        markedCompleteAt = markedCompleteAt,
        rowCreatedAt = rowCreatedAt,
        rowUpdatedAt = now
    )

    private fun Chapter.toEntity(workId: Long, now: Long) = ChapterEntity(
        workId = workId,
        chapterId = id,
        number = number,
        title = title,
        dateUpdated = dateUpdated,
        readProgress = readProgress,
        lastReadAt = lastReadAt,
        markedCompleteAt = markedCompleteAt,
        rowCreatedAt = rowCreatedAt,
        rowUpdatedAt = now
    )
}
