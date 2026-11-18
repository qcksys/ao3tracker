package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.backup.LibraryImportMode
import com.qcksys.ao3tracker.data.backup.LibraryImporter
import com.qcksys.ao3tracker.data.backup.decodeLibraryExport
import com.qcksys.ao3tracker.data.backup.encodeLibraryExport
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.ChapterEntity
import com.qcksys.ao3tracker.data.database.FavouriteTagEntity
import com.qcksys.ao3tracker.data.database.TagEntity
import com.qcksys.ao3tracker.data.database.WorkEntity
import com.qcksys.ao3tracker.data.model.Chapter
import com.qcksys.ao3tracker.data.model.ExportData
import com.qcksys.ao3tracker.data.model.Tag
import com.qcksys.ao3tracker.data.model.Work
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LibraryImportTest {
    @Test
    fun `an export imported into an empty library reproduces its works chapters and tags`() = runTest {
        fixture { accounts, repository, importer ->
            accounts.edit {
                accounts.database.workDao().upsertWork(work(1, lastRead = 500, lastRefreshed = 400, title = "Backed up"))
                accounts.database.chapterDao().upsertChapters(listOf(chapter(1, 11, lastReadAt = 500, progress = 0.5f)))
                accounts.database.tagDao().upsertTags(listOf(tag(1, "Fluff")))
            }
            val exported = repository.getExportData()
            val text = encodeLibraryExport(exported)

            accounts.activate(ACCOUNT)
            val result = importer.import(decodeLibraryExport(text), LibraryImportMode.MERGE, ACCOUNT)

            assertEquals(1, result.added)
            val restored = repository.getExportData()
            assertEquals(exported.works.map { it.withoutRowUpdates() }, restored.works.map { it.withoutRowUpdates() })
            val restoredWork = assertNotNull(accounts.database.workDao().getWorkById(1))
            assertTrue(restoredWork.rowUpdatedAt > 500, "Imported rows must be selected by incremental sync")
        }
    }

    @Test
    fun `merge keeps whichever side was read more recently for each work and chapter`() = runTest {
        fixture { accounts, _, importer ->
            accounts.edit {
                accounts.database.workDao().upsertWork(work(1, lastRead = 900, lastRefreshed = 100, title = "Local title"))
                accounts.database.chapterDao().upsertChapters(listOf(
                    chapter(1, 11, lastReadAt = 900, progress = 0.9f),
                    chapter(1, 12, lastReadAt = 200, progress = 0.2f)
                ))
                accounts.database.tagDao().upsertTags(listOf(tag(1, "Local tag")))
            }
            val backup = exportOf(
                work(1, lastRead = 800, lastRefreshed = 300, title = "Backup title"),
                chapters = listOf(
                    chapter(1, 11, lastReadAt = 100, progress = 0.1f),
                    chapter(1, 12, lastReadAt = 800, progress = 1f),
                    chapter(1, 13, lastReadAt = 700, progress = 0.4f)
                ),
                tags = listOf(tag(1, "Backup tag"))
            )

            val result = importer.import(backup, LibraryImportMode.MERGE, AccountDataStore.GUEST)

            assertEquals(0, result.added)
            assertEquals(1, result.updated)
            val merged = assertNotNull(accounts.database.workDao().getWorkById(1))
            assertEquals(900, merged.lastRead, "The local work was read more recently")
            assertEquals("Backup title", merged.title, "The backup's metadata was refreshed more recently")
            assertEquals(listOf("Backup tag"), accounts.database.tagDao().getTagsByWorkOnce(1).map { it.tag })
            val chapters = accounts.database.chapterDao().getChaptersByWorkOnce(1).associateBy { it.chapterId }
            assertEquals(0.9f, chapters.getValue(11).readProgress)
            assertEquals(1f, chapters.getValue(12).readProgress)
            assertEquals(800, chapters.getValue(12).lastReadAt)
            assertEquals(0.4f, chapters.getValue(13).readProgress)
        }
    }

    @Test
    fun `merge keeps newer local deletions and restores older ones`() = runTest {
        fixture { accounts, _, importer ->
            accounts.edit {
                accounts.database.workDao().upsertWork(work(1, lastRead = 900).copy(rowDeletedAt = 900))
                accounts.database.workDao().upsertWork(work(2, lastRead = 100).copy(rowDeletedAt = 100))
            }
            val backup = ExportData(
                exportedAt = "0",
                works = listOf(
                    exportOf(work(1, lastRead = 500)).works.single(),
                    exportOf(work(2, lastRead = 500), chapters = listOf(chapter(2, 21, lastReadAt = 500, progress = 1f))).works.single()
                )
            )

            val result = importer.import(backup, LibraryImportMode.MERGE, AccountDataStore.GUEST)

            assertEquals(1, result.updated)
            assertNull(accounts.database.workDao().getWorkById(1), "A deletion after the backup's reading stays deleted")
            assertEquals(500, accounts.database.workDao().getWorkById(2)?.lastRead)
            assertEquals(1f, accounts.database.chapterDao().getChapterById(21, 2)?.readProgress)
        }
    }

    @Test
    fun `add missing leaves existing and deleted works unchanged`() = runTest {
        fixture { accounts, _, importer ->
            accounts.edit {
                accounts.database.workDao().upsertWork(work(1, lastRead = 100, title = "Local"))
                accounts.database.workDao().upsertWork(work(2, lastRead = 100).copy(rowDeletedAt = 100))
            }
            val backup = ExportData(
                exportedAt = "0",
                works = listOf(work(1, lastRead = 900, title = "Backup"), work(2, lastRead = 900), work(3, lastRead = 900))
                    .map { exportOf(it).works.single() }
            )

            val result = importer.import(backup, LibraryImportMode.ADD_MISSING, AccountDataStore.GUEST)

            assertEquals(1, result.added)
            assertEquals(0, result.updated)
            assertEquals("Local", accounts.database.workDao().getWorkById(1)?.title)
            assertNull(accounts.database.workDao().getWorkById(2))
            assertNotNull(accounts.database.workDao().getWorkById(3))
        }
    }

    @Test
    fun `replace removes other works resets sync cursors and keeps favourite tags`() = runTest {
        fixture { accounts, _, importer ->
            accounts.activate(ACCOUNT)
            accounts.saveSyncCursors("2026-01-01T00:00:00Z", 500)
            accounts.edit {
                accounts.database.workDao().upsertWork(work(1, lastRead = 900))
                accounts.database.chapterDao().upsertChapters(listOf(chapter(1, 11, lastReadAt = 900, progress = 1f)))
                accounts.database.favouriteTagDao().upsert(FavouriteTagEntity(1, "Kept", favourited = true, updatedAt = 1, pendingSync = false))
            }
            assertEquals(500, accounts.active.value?.localCursor)

            val result = importer.import(exportOf(work(2, lastRead = 100)), LibraryImportMode.REPLACE, ACCOUNT)

            assertEquals(1, result.added)
            assertNull(accounts.database.workDao().getWorkByIdIncludingDeleted(1))
            assertTrue(accounts.database.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
            assertNotNull(accounts.database.workDao().getWorkById(2))
            assertEquals(listOf("Kept"), accounts.database.favouriteTagDao().getAll().map { it.tag })
            val active = assertNotNull(accounts.active.value)
            assertNull(active.remoteCursor)
            assertNull(active.localCursor)
        }
    }

    @Test
    fun `an import for another library writes nothing`() = runTest {
        fixture { accounts, _, importer ->
            assertFailsWith<CancellationException> {
                importer.import(exportOf(work(1, lastRead = 100)), LibraryImportMode.MERGE, ACCOUNT)
            }
            assertNull(accounts.database.workDao().getWorkByIdIncludingDeleted(1))
        }
    }

    @Test
    fun `files from a newer export version are rejected`() {
        assertFailsWith<IllegalArgumentException> {
            decodeLibraryExport("""{"version":2,"exportedAt":"0","works":[]}""")
        }
    }

    private suspend fun fixture(block: suspend (AccountDataStore, Ao3Repository, LibraryImporter) -> Unit) {
        val directory = Files.createTempDirectory("ao3tracker-import-")
        val accounts = createTestAccounts(directory)
        try {
            accounts.initialize()
            block(accounts, Ao3Repository(accounts), LibraryImporter(accounts))
        } finally {
            accounts.close()
            Files.walk(directory).use { files -> files.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private fun Work.withoutRowUpdates() =
        copy(rowUpdatedAt = 0, chapterList = chapterList.map { it.copy(rowUpdatedAt = 0) })

    private fun exportOf(
        work: WorkEntity,
        chapters: List<ChapterEntity> = emptyList(),
        tags: List<TagEntity> = emptyList()
    ) = ExportData(
        exportedAt = "0",
        works = listOf(Work(
            id = work.id,
            title = work.title,
            lastRefreshed = work.lastRefreshed,
            lastRead = work.lastRead,
            rowCreatedAt = work.rowCreatedAt,
            rowUpdatedAt = work.rowUpdatedAt,
            tags = tags.map { Tag(it.workId, it.tag, it.href, it.typeId, it.rowCreatedAt) },
            chapterList = chapters.map {
                Chapter(
                    id = it.chapterId,
                    workId = it.workId,
                    readProgress = it.readProgress,
                    lastReadAt = it.lastReadAt,
                    rowCreatedAt = it.rowCreatedAt,
                    rowUpdatedAt = it.rowUpdatedAt
                )
            }
        ))
    )

    private fun work(id: Long, lastRead: Long, lastRefreshed: Long? = null, title: String? = null) =
        WorkEntity(id, title = title, lastRefreshed = lastRefreshed, lastRead = lastRead, rowCreatedAt = 50, rowUpdatedAt = lastRead)

    private fun chapter(workId: Long, id: Long, lastReadAt: Long, progress: Float) =
        ChapterEntity(workId, chapterId = id, readProgress = progress, lastReadAt = lastReadAt, rowCreatedAt = 50, rowUpdatedAt = lastReadAt)

    private fun tag(workId: Long, name: String) = TagEntity(workId, name, "/tags/$name", 1, 50)

    private companion object {
        const val ACCOUNT = "PRODUCTION:user"
    }
}
