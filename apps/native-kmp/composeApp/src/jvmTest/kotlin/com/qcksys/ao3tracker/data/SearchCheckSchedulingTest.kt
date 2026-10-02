package com.qcksys.ao3tracker.data

import cafe.adriel.voyager.core.model.ScreenModelStore
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.model.SearchCheckMessage
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.data.repository.SearchCheckRepository
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.sync.SyncTriggers
import com.qcksys.ao3tracker.ui.screens.searches.SearchesScreenModel
import com.qcksys.ao3tracker.util.JsonConfig
import cafe.adriel.voyager.core.annotation.InternalVoyagerApi
import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.model.SyncGetResponse
import com.qcksys.ao3tracker.data.model.SyncPostRequest
import com.qcksys.ao3tracker.data.model.SyncPostResponse
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.sync.SyncRemote
import com.qcksys.ao3tracker.data.sync.SyncRepository
import kotlinx.coroutines.flow.MutableStateFlow
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import kotlinx.serialization.encodeToString
import kotlin.test.*
import kotlin.time.Clock

@OptIn(ExperimentalCoroutinesApi::class, InternalVoyagerApi::class)
class SearchCheckSchedulingTest {
    @Test
    fun `rate limiting stops check all and also blocks manual checks until Retry-After expires`() = runTest {
        fixture { model, searches, _, _, setTime ->
            val first = searches.save("First", "https://archiveofourown.org/works")
            searches.save("Second", "https://archiveofourown.org/bookmarks")
            model.checkAll()
            runCurrent()
            val run = assertNotNull(model.runningCheck.value)
            model.onCheckMessage(run.runId, JsonConfig.json.encodeToString(SearchCheckMessage(
                type = "searchCheckError", error = "Too many requests", retryAfterSeconds = 120
            )))
            runCurrent()
            assertFalse(model.isChecking.value)
            assertNull(model.runningCheck.value)
            assertNotNull(model.checkStatus.value)
            model.checkSearch(first.id)
            runCurrent()
            assertNull(model.runningCheck.value)
            model.fullScan(first.id)
            runCurrent()
            assertNull(model.runningCheck.value)
            setTime(121_000)
            model.checkSearch(first.id)
            runCurrent()
            assertNotNull(model.runningCheck.value)
        }
    }

    @Test
    fun `partial attempts use the automatic cooldown even though their successful cursor stays old`() = runTest {
        fixture { model, searches, checks, accounts, _ ->
            val search = searches.save("Stories", "https://archiveofourown.org/works")
            checks.record(checks.capture(search.id).copy(startedAt = 1000), SearchCheckMessage(
                type = "searchCheckResult", context = "same", works = emptyList(), baseline = true
            ))
            model.checkAll()
            runCurrent()
            val run = assertNotNull(model.runningCheck.value)
            model.onCheckMessage(run.runId, JsonConfig.json.encodeToString(SearchCheckMessage(
                type = "searchCheckResult", context = "same", works = emptyList(), complete = false, nextUrl = "https://archiveofourown.org/works?page=11"
            )))
            runCurrent()
            assertTrue(accounts.database.searchCheckDao().getOne(search.id)!!.partial)
            assertEquals(1000, accounts.database.searchCheckDao().getOne(search.id)!!.checkedAt)
            model.checkAll(automatic = true)
            runCurrent()
            assertNull(model.runningCheck.value)
            assertFalse(model.isChecking.value)
        }
    }

    @Test
    fun `late messages from cancelled runs cannot establish a baseline`() = runTest {
        fixture { model, searches, _, accounts, _ ->
            val search = searches.save("Stories", "https://archiveofourown.org/works")
            model.checkSearch(search.id)
            runCurrent()
            val run = assertNotNull(model.runningCheck.value)
            model.cancelChecks()
            model.onCheckMessage(run.runId, JsonConfig.json.encodeToString(SearchCheckMessage(
                type = "searchCheckResult", context = "same", works = emptyList(), baseline = true
            )))
            runCurrent()
            assertNull(accounts.database.searchCheckDao().getOne(search.id))
        }
    }

    private suspend fun TestScope.fixture(
        block: suspend (SearchesScreenModel, SavedSearchRepository, SearchCheckRepository, AccountDataStore, (Long) -> Unit) -> Unit
    ) {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        val directory = Files.createTempDirectory("ao3tracker-search-scheduling-")
        val accounts = createTestAccounts(directory, dispatcher)
        val holder = "search-test:${directory.fileName}"
        try {
            accounts.initialize()
            accounts.activate(AccountDataStore.GUEST)
            val searches = SavedSearchRepository(accounts)
            val checks = SearchCheckRepository(accounts)
            val auth = object : SyncAuthentication {
                override val authState = MutableStateFlow<AuthState>(AuthState.Idle)
                override fun currentOwner(): String? = null
                override fun isCurrentSession(token: String, owner: String) = false
                override suspend fun invalidateSession() = Unit
            }
            val remote = object : SyncRemote {
                override suspend fun fetchSyncData(token: String, lastSyncedAt: String?, workCursor: Long?, limit: Int?): Result<SyncGetResponse> = error("Search checks must not sync")
                override suspend fun sendSyncData(token: String, request: SyncPostRequest): Result<SyncPostResponse> = error("Search checks must not sync")
            }
            val sync = SyncTriggers(SyncRepository(remote, auth, FavouriteTagRepository(accounts), searches, accounts))
            var now = Clock.System.now().toEpochMilliseconds()
            val model = ScreenModelStore.getOrPut(holder, null) {
                SearchesScreenModel(searches, sync, checks, AppSettings(null), { now })
            }
            block(model, searches, checks, accounts) { now += it }
            model.cancelChecks()
        } finally {
            ScreenModelStore.onDisposeNavigator(holder)
            runCurrent()
            accounts.close()
            Dispatchers.resetMain()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }
}
