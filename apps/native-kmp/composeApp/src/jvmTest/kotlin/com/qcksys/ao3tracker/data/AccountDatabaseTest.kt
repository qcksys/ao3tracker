package com.qcksys.ao3tracker.data

import app.cash.turbine.test
import app.cash.turbine.testIn
import app.cash.turbine.turbineScope
import com.qcksys.ao3tracker.data.database.*
import com.qcksys.ao3tracker.data.model.FilterState
import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.util.JsonConfig
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlin.test.*

class AccountDatabaseTest {
    @Test
    fun `accounts use distinct files and survive reopening with independent cursors`() = runTest {
        val directory = Files.createTempDirectory("ao3tracker-accounts-")
        var accounts = createTestAccounts(directory)
        try {
            accounts.initialize()
            accounts.activate(AccountDataStore.GUEST)
            val guest = accounts.database
            accounts.edit { guest.workDao().upsertWork(work(1)) }
            accounts.activate(A)
            val first = accounts.database
            assertNotSame(guest, first)
            assertTrue(first.workDao().getAllWorkIds().isEmpty())
            accounts.edit { first.workDao().upsertWork(work(2)) }
            accounts.forAccount(A, { true }) { accounts.saveSyncCursors("cursor-a", 100) }
            accounts.activate(B)
            assertNotSame(first, accounts.database)
            accounts.edit { accounts.database.workDao().upsertWork(work(3)) }
            accounts.close()
            accounts = createTestAccounts(directory)
            assertEquals(B, accounts.initialize().owner)
            assertEquals(listOf(3L), accounts.database.workDao().getAllWorkIds())
            accounts.activate(A)
            assertEquals("cursor-a", accounts.active.value?.remoteCursor)
            assertEquals(100L, accounts.active.value?.localCursor)
            assertEquals(listOf(2L), accounts.database.workDao().getAllWorkIds())
            accounts.activate("DEV:a")
            assertTrue(accounts.database.workDao().getAllWorkIds().isEmpty())
            accounts.activate(AccountDataStore.GUEST)
            assertEquals(listOf(1L), accounts.database.workDao().getAllWorkIds())
            assertNull(accounts.active.value?.remoteCursor)
            Files.list(directory).use { files ->
                assertEquals(5L, files.filter { it.toString().endsWith(".db") }.count())
            }
        } finally {
            accounts.close()
            Files.walk(directory).use { files -> files.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    @Test
    fun `legacy active and archived accounts migrate all rows once including guest`() = runTest {
        fixture { accounts ->
            val legacy = accounts.database
            val snapshot = AccountSnapshot(
                works = listOf(work(1).copy(rowDeletedAt = 50)),
                chapters = listOf(chapter(1).copy(rowDeletedAt = 50)),
                tags = listOf(tag(1)),
                favourites = listOf(favourite().copy(favourited = false)),
                searches = listOf(search().copy(deleted = true))
            )
            legacy.workDao().upsertWork(work(2))
            legacy.accountDao().setActive(ActiveAccountEntity(owner = A, remoteCursor = "active-cursor", localCursor = 123))
            legacy.accountDao().archive(AccountArchiveEntity(
                owner = B, data = JsonConfig.json.encodeToString(AccountSnapshot.serializer(), snapshot),
                remoteCursor = "archive-cursor", localCursor = 456
            ))
            legacy.accountDao().archive(AccountArchiveEntity(
                owner = AccountDataStore.GUEST,
                data = JsonConfig.json.encodeToString(AccountSnapshot.serializer(), snapshot.copy(works = listOf(work(1))))
            ))
            accounts.activate(A)
            assertNotSame(legacy, accounts.database)
            assertEquals(listOf(2L), accounts.database.workDao().getAllWorkIds())
            assertEquals("active-cursor", accounts.active.value?.remoteCursor)
            accounts.activate(B)
            val db = accounts.database
            assertEquals(snapshot.works, db.workDao().getAllWorksIncludingDeletedOnce())
            assertEquals(snapshot.chapters, db.chapterDao().getAllChaptersIncludingDeletedOnce())
            assertEquals(snapshot.tags, db.tagDao().getAll())
            assertEquals(snapshot.favourites, db.favouriteTagDao().getAll())
            assertEquals(snapshot.searches, db.savedSearchDao().getAll())
            assertEquals("archive-cursor", accounts.active.value?.remoteCursor)
            assertEquals(456L, accounts.active.value?.localCursor)
            accounts.edit { accounts.clearAccount() }
            accounts.activate(AccountDataStore.GUEST)
            assertNotNull(accounts.database.workDao().getWorkById(1))
            accounts.activate(B)
            assertTrue(accounts.database.workDao().getAllWorksIncludingDeletedOnce().isEmpty())
            assertNull(accounts.active.value?.remoteCursor)
            assertNotNull(legacy.accountDao().getArchive(B))
        }
    }

    @Test
    fun `unowned legacy rows belong to guest unless a stored session claims them`() = runTest {
        fixture { accounts ->
            accounts.database.workDao().upsertWork(work(1))
            accounts.activate(A)
            assertTrue(accounts.database.workDao().getAllWorkIds().isEmpty())
            accounts.activate(AccountDataStore.GUEST)
            assertEquals(listOf(1L), accounts.database.workDao().getAllWorkIds())
            accounts.activate(B, claimLegacy = true)
            assertTrue(accounts.database.workDao().getAllWorkIds().isEmpty())
        }
        fixture { accounts ->
            accounts.database.workDao().upsertWork(work(1))
            accounts.activate(A, claimLegacy = true)
            assertEquals(listOf(1L), accounts.database.workDao().getAllWorkIds())
            accounts.activate(AccountDataStore.GUEST)
            assertTrue(accounts.database.workDao().getAllWorkIds().isEmpty())
        }
    }

    @Test
    fun `guest import copies live data marks it pending and is repeatable without changing guest`() = runTest {
        fixture { accounts ->
            accounts.activate(AccountDataStore.GUEST)
            val guest = accounts.database
            accounts.edit {
                guest.workDao().upsertWork(work(1))
                guest.workDao().upsertWork(work(2).copy(rowDeletedAt = 200))
                guest.chapterDao().upsertChapters(listOf(chapter(1), chapter(1).copy(chapterId = 12, rowDeletedAt = 200)))
                guest.tagDao().upsertTag(tag(1))
                guest.favouriteTagDao().upsert(favourite().copy(pendingSync = false))
                guest.savedSearchDao().upsert(search().copy(pendingSync = false))
            }
            accounts.activate(A)
            accounts.forAccount(A, { true }) { accounts.saveSyncCursors("account-cursor", Long.MAX_VALUE - 1) }
            assertEquals(GuestImportResult(1, 1, 1, 1), accounts.importGuest(A) { true })
            val db = accounts.database
            assertEquals(Long.MAX_VALUE, db.workDao().getWorkById(1)?.rowUpdatedAt)
            assertEquals(100L, db.workDao().getWorkById(1)?.lastRead)
            assertEquals(Long.MAX_VALUE, db.chapterDao().getChapterById(11, 1)?.rowUpdatedAt)
            assertEquals(0.5f, db.chapterDao().getChapterById(11, 1)?.readProgress)
            assertEquals(listOf(tag(1)), db.tagDao().getAll())
            assertTrue(db.favouriteTagDao().getAll().single().pendingSync)
            assertTrue(db.savedSearchDao().getAll().single().pendingSync)
            assertEquals("account-cursor", accounts.active.value?.remoteCursor)
            assertTrue(accounts.importGuest(A) { true }.isEmpty)
            accounts.activate(AccountDataStore.GUEST)
            assertEquals(work(1), guest.workDao().getWorkById(1))
            assertFalse(guest.savedSearchDao().getAll().single().pendingSync)
            accounts.activate(B)
            assertTrue(accounts.database.workDao().getAllWorkIds().isEmpty())
            assertEquals(1, accounts.importGuest(B) { true }.works)
        }
    }

    @Test
    fun `guest import keeps account entries including deletions and ignores guest deletions`() = runTest {
        fixture { accounts ->
            accounts.activate(AccountDataStore.GUEST)
            accounts.edit {
                accounts.database.workDao().upsertWork(work(1))
                accounts.database.chapterDao().upsertChapter(chapter(1))
                accounts.database.favouriteTagDao().upsert(favourite())
                accounts.database.favouriteTagDao().upsert(favourite().copy(tag = "Removed", favourited = false))
                accounts.database.savedSearchDao().upsert(search())
                accounts.database.savedSearchDao().upsert(search().copy(id = "removed", deleted = true))
            }
            accounts.activate(A)
            val existing = work(1).copy(rowDeletedAt = 250)
            accounts.edit {
                accounts.database.workDao().upsertWork(existing)
                accounts.database.favouriteTagDao().upsert(favourite().copy(favourited = false))
                accounts.database.savedSearchDao().upsert(search().copy(deleted = true))
            }
            assertTrue(accounts.importGuest(A) { true }.isEmpty)
            assertEquals(existing, accounts.database.workDao().getWorkByIdIncludingDeleted(1))
            assertTrue(accounts.database.chapterDao().getAllChaptersOnce().isEmpty())
            assertFalse(accounts.database.favouriteTagDao().getAll().single().favourited)
            assertTrue(accounts.database.savedSearchDao().getAll().single().deleted)
        }
    }

    @Test
    fun `import refuses guests stale owners and rolls back when session expires`() = runTest {
        fixture { accounts ->
            accounts.activate(AccountDataStore.GUEST)
            accounts.edit { accounts.database.workDao().upsertWork(work(1)) }
            assertFailsWith<IllegalArgumentException> { accounts.importGuest(AccountDataStore.GUEST) { true } }
            accounts.activate(A)
            val revision = accounts.localRevision
            assertFailsWith<CancellationException> { accounts.importGuest(B) { true } }
            var checks = 0
            assertFailsWith<CancellationException> { accounts.importGuest(A) { ++checks == 1 } }
            assertEquals(revision, accounts.localRevision)
            assertTrue(accounts.database.workDao().getAllWorkIds().isEmpty())
            accounts.activate(AccountDataStore.GUEST)
            assertNotNull(accounts.database.workDao().getWorkById(1))
        }
    }

    @Test
    fun `live repositories switch to the selected account file`() = runTest {
        fixture { accounts ->
            accounts.activate(A)
            accounts.edit {
                accounts.database.workDao().upsertWork(work(1))
                accounts.database.tagDao().upsertTag(tag(1))
                accounts.database.favouriteTagDao().upsert(favourite())
                accounts.database.savedSearchDao().upsert(search())
            }
            val works = Ao3Repository(accounts)
            turbineScope {
                val filtered = works.getFilteredWorks(FilterState()).testIn(backgroundScope)
                val favourites = FavouriteTagRepository(accounts).observeFavourites().testIn(backgroundScope)
                val searches = SavedSearchRepository(accounts).observeLive().testIn(backgroundScope)
                assertEquals(listOf(1L), filtered.awaitItem().map { it.id })
                assertEquals(setOf("7\tFluff"), favourites.awaitItem())
                assertEquals(listOf("search"), searches.awaitItem().map { it.id })
                accounts.activate(B)
                assertTrue(filtered.awaitItem().isEmpty())
                assertTrue(favourites.awaitItem().isEmpty())
                assertTrue(searches.awaitItem().isEmpty())
                accounts.activate(A)
                assertEquals(listOf(1L), filtered.awaitItem().map { it.id })
                assertEquals(setOf("7\tFluff"), favourites.awaitItem())
                assertEquals(listOf("search"), searches.awaitItem().map { it.id })
                filtered.cancelAndIgnoreRemainingEvents()
                favourites.cancelAndIgnoreRemainingEvents()
                searches.cancelAndIgnoreRemainingEvents()
            }
            works.getWorkById(1).test {
                assertNotNull(awaitItem())
                accounts.activate(B)
                assertNull(awaitItem())
            }
            works.getDistinctTags(TagType.FREEFORM).test {
                assertTrue(awaitItem().isEmpty())
                accounts.activate(A)
                assertEquals(listOf("Fluff"), awaitItem())
            }
        }
    }

    private suspend fun fixture(block: suspend (AccountDataStore) -> Unit) {
        val directory = Files.createTempDirectory("ao3tracker-guest-")
        val accounts = createTestAccounts(directory)
        try {
            accounts.initialize()
            block(accounts)
        } finally {
            accounts.close()
            Files.walk(directory).use { files -> files.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    companion object {
        private const val A = "PRODUCTION:a"
        private const val B = "PRODUCTION:b"
        private fun work(id: Long) = WorkEntity(id, title = "Guest work", lastRead = 100, rowCreatedAt = 100, rowUpdatedAt = 100)
        private fun chapter(id: Long) = ChapterEntity(id, chapterId = 11, readProgress = 0.5f, lastReadAt = 100, rowCreatedAt = 100, rowUpdatedAt = 100)
        private fun tag(id: Long) = TagEntity(id, "Fluff", "/tags/Fluff/works", 7, 100)
        private fun favourite() = FavouriteTagEntity(7, "Fluff", true, 100, true)
        private fun search() = SavedSearchEntity("search", "Fluff", "https://archiveofourown.org/tags/Fluff/works", false, 100, true)
    }
}
