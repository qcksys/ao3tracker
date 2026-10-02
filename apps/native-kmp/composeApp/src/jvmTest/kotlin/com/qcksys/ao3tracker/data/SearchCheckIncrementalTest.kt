package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.model.SearchCheckMessage
import com.qcksys.ao3tracker.data.model.SearchWork
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.data.repository.SearchCheckRepository
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlin.test.*

class SearchCheckIncrementalTest {
    private val original = SearchWork(1, "01 Oct 2026", "1/2", "1000")
    private fun result(vararg works: SearchWork, complete: Boolean = true, fullScan: Boolean = false) =
        SearchCheckMessage(type = "searchCheckResult", context = "same-search", works = works.toList(), complete = complete, fullScan = fullScan, nextUrl = if (complete) null else "https://archiveofourown.org/works?page=11")

    @Test
    fun `partial scans accumulate distinct changes without advancing the successful cursor`() = runTest {
        fixture { accounts ->
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id).copy(startedAt = 1000), result(original))
            val added = original.copy(id = 2)
            checks.record(checks.capture(search.id).copy(startedAt = 2000), result(added, complete = false))
            val partial = accounts.database.searchCheckDao().getOne(search.id)!!
            assertTrue(partial.partial)
            assertEquals(1000, partial.checkedAt)
            assertEquals(1, partial.newWorks)
            assertTrue(partial.worksJson.contains("1000"))
            checks.record(checks.capture(search.id).copy(startedAt = 3000), result(added.copy(words = "2000"), complete = false))
            val repeated = accounts.database.searchCheckDao().getOne(search.id)!!
            assertEquals(1, repeated.newWorks)
            assertEquals(0, repeated.updatedWorks)
            assertEquals(1000, repeated.checkedAt)
            checks.record(checks.capture(search.id).copy(startedAt = 4000), result(original.copy(words = "3000")))
            val complete = accounts.database.searchCheckDao().getOne(search.id)!!
            assertFalse(complete.partial)
            assertEquals(2000, complete.checkedAt)
            assertNull(complete.resumeUrl)
            assertNull(complete.scanStartedAt)
            assertEquals(1, complete.newWorks)
            assertEquals(1, complete.updatedWorks)
        }
    }

    @Test
    fun `opening clears counts and rejects a result captured before the search was opened`() = runTest {
        fixture { accounts ->
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id), result(original))
            checks.record(checks.capture(search.id), result(original.copy(words = "2000")))
            val request = checks.capture(search.id)
            checks.markViewed(search.id)
            assertFailsWith<CancellationException> { checks.record(request, result(original.copy(id = 2))) }
            val viewed = accounts.database.searchCheckDao().getOne(search.id)!!
            assertEquals(0, viewed.updatedWorks)
            assertEquals(request.previous!!.checkedAt, viewed.checkedAt)
            assertEquals(request.previous.worksJson, viewed.worksJson)
            assertTrue(viewed.lastViewedAt!! > request.previous.lastViewedAt!!)
        }
    }

    @Test
    fun `the first full scan establishes old work coverage without reporting old works as new`() = runTest {
        fixture { accounts ->
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id), result(original))
            assertFalse(accounts.database.searchCheckDao().getOne(search.id)!!.fullSnapshot)
            checks.record(checks.capture(search.id), result(original, original.copy(id = 2), fullScan = true))
            val full = accounts.database.searchCheckDao().getOne(search.id)!!
            assertTrue(full.fullSnapshot)
            assertEquals(0, full.newWorks)
            checks.record(checks.capture(search.id), result(original, original.copy(id = 2), original.copy(id = 3), fullScan = true))
            assertEquals(1, accounts.database.searchCheckDao().getOne(search.id)!!.newWorks)
        }
    }

    @Test
    fun `incremental snapshots retain older works so overlapping windows do not rediscover them`() = runTest {
        fixture { accounts ->
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id), result(original, original.copy(id = 2), fullScan = true))
            checks.record(checks.capture(search.id), result(original.copy(id = 2)))
            checks.record(checks.capture(search.id), result(original))
            val snapshot = accounts.database.searchCheckDao().getOne(search.id)!!
            assertEquals(0, snapshot.newWorks)
            assertEquals(0, snapshot.updatedWorks)
        }
    }

    @Test
    fun `changed contexts discard pending counts and establish a fresh baseline`() = runTest {
        fixture { accounts ->
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id), result(original))
            checks.record(checks.capture(search.id), result(original.copy(id = 2)))
            checks.record(checks.capture(search.id), result(original.copy(id = 3)).copy(context = "another-viewer", baseline = true))
            val snapshot = accounts.database.searchCheckDao().getOne(search.id)!!
            assertEquals(0, snapshot.newWorks)
            assertEquals(0, snapshot.updatedWorks)
            assertNull(snapshot.previousCheckedAt)
        }
    }

    private suspend fun fixture(block: suspend (AccountDataStore) -> Unit) {
        val directory = Files.createTempDirectory("ao3tracker-search-incremental-")
        val accounts = createTestAccounts(directory)
        try {
            accounts.initialize()
            accounts.activate(AccountDataStore.GUEST)
            block(accounts)
        } finally {
            accounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }
}
