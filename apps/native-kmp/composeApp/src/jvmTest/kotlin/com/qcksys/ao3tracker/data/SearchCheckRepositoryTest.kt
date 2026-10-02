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

class SearchCheckRepositoryTest {
    private val original = SearchWork(1, "01 Oct 2026", "1/2", "1000")
    private fun result(vararg works: SearchWork, context: String = "search-and-viewer") =
        SearchCheckMessage(type = "searchCheckResult", context = context, works = works.toList())

    @Test
    fun `baseline and disjoint new and updated counts never dirty synced data`() = runTest {
        fixture { accounts ->
            val savedSearches = SavedSearchRepository(accounts)
            val search = savedSearches.save("Stories", "https://archiveofourown.org/works")
            savedSearches.markSynced(search)
            val savedBefore = accounts.database.savedSearchDao().getOne(search.id)
            val revisionBefore = accounts.localRevision
            val activeBefore = accounts.active.value
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id), result(original))
            val baseline = accounts.database.searchCheckDao().getOne(search.id)!!
            assertNull(baseline.previousCheckedAt)
            assertEquals(0, baseline.newWorks)
            assertEquals(0, baseline.updatedWorks)

            val updated = original.copy(chapters = "2/2", words = "2000")
            val added = original.copy(id = 2)
            checks.record(checks.capture(search.id), result(updated, added, added))
            val changed = accounts.database.searchCheckDao().getOne(search.id)!!
            assertEquals(1, changed.newWorks)
            assertEquals(1, changed.updatedWorks)
            assertEquals(baseline.checkedAt, changed.previousCheckedAt)

            checks.record(checks.capture(search.id), result(updated, added))
            assertEquals(0, accounts.database.searchCheckDao().getOne(search.id)!!.newWorks)
            assertEquals(0, accounts.database.searchCheckDao().getOne(search.id)!!.updatedWorks)
            assertEquals(savedBefore, accounts.database.savedSearchDao().getOne(search.id))
            assertTrue(savedSearches.getPendingSync().isEmpty())
            assertEquals(revisionBefore, accounts.localRevision)
            assertEquals(activeBefore, accounts.active.value)
        }
    }

    @Test
    fun `failed and incomplete checks keep the previous baseline and counts`() = runTest {
        fixture { accounts ->
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id), result(original))
            val before = accounts.database.searchCheckDao().getOne(search.id)
            assertFailsWith<IllegalArgumentException> {
                checks.record(checks.capture(search.id), SearchCheckMessage(type = "searchCheckError", error = "429"))
            }
            assertFailsWith<IllegalArgumentException> {
                checks.record(checks.capture(search.id), SearchCheckMessage(type = "searchCheckResult", context = "search-and-viewer"))
            }
            assertEquals(before, accounts.database.searchCheckDao().getOne(search.id))
            checks.record(checks.capture(search.id), result(original.copy(updated = "02 Oct 2026")))
            assertEquals(1, accounts.database.searchCheckDao().getOne(search.id)!!.updatedWorks)
        }
    }

    @Test
    fun `different search or AO3 viewer establishes a new baseline`() = runTest {
        fixture { accounts ->
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id), result(original))
            checks.record(checks.capture(search.id), result(original.copy(id = 2), context = "different-viewer-or-filters"))
            val check = accounts.database.searchCheckDao().getOne(search.id)!!
            assertNull(check.previousCheckedAt)
            assertEquals(0, check.newWorks)
            assertEquals(0, check.updatedWorks)
        }
    }

    @Test
    fun `changed account or deleted search rejects an in flight result`() = runTest {
        fixture { accounts ->
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            val request = checks.capture(search.id)
            accounts.activate("PRODUCTION:other")
            assertFailsWith<CancellationException> { checks.record(request, result(original)) }
            assertNull(accounts.database.searchCheckDao().getOne(search.id))
            accounts.activate(AccountDataStore.GUEST)
            val guestRequest = checks.capture(search.id)
            SavedSearchRepository(accounts).delete(search.id)
            assertFailsWith<CancellationException> { checks.record(guestRequest, result(original)) }
        }
    }

    @Test
    fun `checks persist locally across restart and are cleared with the library`() = runTest {
        val directory = Files.createTempDirectory("ao3tracker-search-checks-")
        var accounts = createTestAccounts(directory)
        try {
            accounts.initialize()
            accounts.activate(AccountDataStore.GUEST)
            val search = SavedSearchRepository(accounts).save("Stories", "https://archiveofourown.org/works")
            val checks = SearchCheckRepository(accounts)
            checks.record(checks.capture(search.id), result(original))
            accounts.close()
            accounts = createTestAccounts(directory)
            accounts.initialize()
            assertNotNull(accounts.database.searchCheckDao().getOne(search.id))
            accounts.edit { accounts.clearAccount() }
            assertNull(accounts.database.searchCheckDao().getOne(search.id))
        } finally {
            accounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private suspend fun fixture(block: suspend (AccountDataStore) -> Unit) {
        val directory = Files.createTempDirectory("ao3tracker-search-checks-")
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
