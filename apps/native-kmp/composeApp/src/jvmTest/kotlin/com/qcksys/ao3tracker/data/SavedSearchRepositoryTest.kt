package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class SavedSearchRepositoryTest {
    @Test
    fun `update preserves identity and name and keeps a newer edit pending after an old acknowledgement`() = runTest {
        fixture { accounts ->
            val repository = SavedSearchRepository(accounts)
            val search = repository.save("My stories", "https://archiveofourown.org/works")
                .copy(updatedAt = 4_102_444_800_000L, pendingSync = false)
            accounts.database.savedSearchDao().upsert(search)
            val other = repository.save("Other stories", "https://archiveofourown.org/bookmarks")
            repository.markSynced(other)
            val revision = accounts.localRevision
            val url = "https://archiveofourown.org/works?work_search%5Bquery%5D=fluff"

            repository.updateUrl(search.id, url)
            repository.markSynced(search)
            val updated = repository.getPendingSync().single()
            assertEquals(search.copy(url = url, updatedAt = search.updatedAt + 1, pendingSync = true), updated)
            assertEquals(2, accounts.database.savedSearchDao().getAll().size)
            assertEquals(other.copy(pendingSync = false), accounts.database.savedSearchDao().getOne(other.id))
            assertTrue(accounts.localRevision > revision)
        }
    }

    @Test
    fun `missing deleted and cancelled updates do not alter the library`() = runTest {
        fixture { accounts ->
            val repository = SavedSearchRepository(accounts)
            val search = repository.save("Stories", "https://archiveofourown.org/works")
            val url = "https://archiveofourown.org/bookmarks"
            assertFailsWith<CancellationException> { repository.updateUrl(search.id, url) { false } }
            assertEquals(search, accounts.database.savedSearchDao().getOne(search.id))
            repository.delete(search.id)
            val before = accounts.database.savedSearchDao().getAll()
            assertFailsWith<IllegalArgumentException> { repository.updateUrl(search.id, url) }
            assertFailsWith<IllegalArgumentException> { repository.updateUrl("missing", url) }
            assertEquals(before, accounts.database.savedSearchDao().getAll())
        }
    }

    private suspend fun fixture(block: suspend (AccountDataStore) -> Unit) {
        val directory = Files.createTempDirectory("ao3tracker-saved-search-")
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
