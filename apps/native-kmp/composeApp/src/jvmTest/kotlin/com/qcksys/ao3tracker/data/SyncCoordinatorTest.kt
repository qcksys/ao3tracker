package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.WorkEntity
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.model.SyncGetResponse
import com.qcksys.ao3tracker.data.model.SyncPostRequest
import com.qcksys.ao3tracker.data.model.SyncPostResponse
import com.qcksys.ao3tracker.data.model.SyncResult
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.data.sync.SyncCoordinator
import com.qcksys.ao3tracker.data.sync.SyncRemote
import com.qcksys.ao3tracker.data.sync.SyncRepository
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalCoroutinesApi::class)
class SyncCoordinatorTest {
    @Test
    fun cancellingTheRequestingScreenDoesNotCancelSyncOrLoseItsResult() = runTest {
        withCoordinator { f ->
            val started = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            f.onFetch = {
                started.complete(Unit)
                release.await()
                Result.success(response())
            }
            lateinit var request: Deferred<SyncResult>
            val screen = launch {
                request = f.coordinator.requestSync()
                request.await()
            }
            started.await()
            screen.cancelAndJoin()
            assertTrue(f.coordinator.syncState.value.isSyncing)
            assertTrue(request.isActive)
            release.complete(Unit)

            val result = assertIs<SyncResult.Success>(request.await())
            assertEquals(result, f.coordinator.lastSyncResult.value?.result)
            assertFalse(f.coordinator.syncState.value.isSyncing)
            assertTrue(f.coordinator.syncState.value.debugEntries.last().message.startsWith("Sync completed:"))
        }
    }

    @Test
    fun requestsRunSequentiallyAndQueuedFullSyncRetainsItsOptions() = runTest {
        withCoordinator { f ->
            f.accounts.forAccount("production:a", { true }) { f.accounts.saveSyncCursors(STAMP, 100) }
            val started = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            f.onFetch = {
                if (f.fetchCursors.size == 1) {
                    started.complete(Unit)
                    release.await()
                }
                Result.success(response())
            }
            val first = f.coordinator.requestSync()
            started.await()
            val second = f.coordinator.requestSync(forceFull = true)
            runCurrent()
            assertEquals(1, f.fetchCursors.size)
            release.complete(Unit)
            assertIs<SyncResult.Success>(first.await())
            assertIs<SyncResult.Success>(second.await())
            assertEquals(listOf(STAMP, null), f.fetchCursors)
        }
    }

    @Test
    fun queuedSyncAndClearCannotRunForAReplacementAccount() = runTest {
        withCoordinator { f ->
            val started = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            f.onFetch = {
                started.complete(Unit)
                release.await()
                Result.success(response())
            }
            val first = f.coordinator.requestSync()
            started.await()
            val signOut = f.coordinator.requestSignOut()
            f.switchAccount("production:b")
            f.seedWork()
            release.complete(Unit)

            assertIs<SyncResult.NotAuthenticated>(first.await())
            assertIs<SyncResult.NotAuthenticated>(signOut.await())
            assertEquals(1, f.fetchCursors.size)
            assertEquals(0, f.signOuts)
            assertNotNull(f.accounts.database.workDao().getWorkById(1))
        }
    }

    @Test
    fun signOutCleanupContinuesAfterSettingsIsCancelled() = runTest {
        withCoordinator { f ->
            f.seedWork()
            val cleaningUp = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            f.beforeSignOut = {
                cleaningUp.complete(Unit)
                release.await()
            }
            lateinit var request: Deferred<SyncResult>
            val settings = launch {
                request = f.coordinator.requestSignOut()
                request.await()
            }
            cleaningUp.await()
            settings.cancelAndJoin()
            assertTrue(f.coordinator.isSigningOut.value)
            assertTrue(f.accounts.database.workDao().getAllWorkIds().isEmpty())
            release.complete(Unit)

            assertIs<SyncResult.Success>(request.await())
            assertEquals(1, f.signOuts)
            assertEquals(AccountDataStore.GUEST, f.accounts.active.value?.owner)
            assertTrue(f.coordinator.lastSyncResult.value!!.signedOut)
            assertFalse(f.coordinator.isSigningOut.value)
        }
    }

    @Test
    fun changingAccountWhileCleanupWaitsDoesNotSignOutTheNewAccount() = runTest {
        withCoordinator { f ->
            val cleaningUp = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            f.beforeSignOut = {
                cleaningUp.complete(Unit)
                release.await()
            }
            val request = f.coordinator.requestSignOut()
            cleaningUp.await()
            f.switchAccount("production:b")
            f.seedWork()
            release.complete(Unit)

            assertIs<SyncResult.NotAuthenticated>(request.await())
            assertEquals(0, f.signOuts)
            assertEquals("production:b", f.auth.currentOwner())
            assertNotNull(f.accounts.database.workDao().getWorkById(1))
            assertFalse(f.coordinator.isSigningOut.value)
        }
    }

    @Test
    fun failedSyncPreservesDataAndDoesNotPreventTheNextRequest() = runTest {
        withCoordinator { f ->
            f.seedWork()
            f.onSend = { Result.failure(IllegalStateException("Offline")) }
            assertIs<SyncResult.Error>(f.coordinator.requestSignOut().await())
            assertNotNull(f.accounts.database.workDao().getWorkById(1))
            assertEquals(0, f.signOuts)
            assertFalse(f.coordinator.isSigningOut.value)
            assertIs<SyncResult.Error>(f.coordinator.lastSyncResult.value?.result)

            f.onSend = { Result.success(SyncPostResponse(emptyList(), emptyList(), STAMP)) }
            assertIs<SyncResult.Success>(f.coordinator.requestSync().await())
            assertIs<SyncResult.Success>(f.coordinator.lastSyncResult.value?.result)
        }
    }

    @Test
    fun automaticSyncUpdatesProgressWithoutPublishingASnackbarResult() = runTest {
        withCoordinator { f ->
            assertIs<SyncResult.Success>(f.coordinator.requestSync(showResult = false).await())
            assertNull(f.coordinator.lastSyncResult.value)
            assertEquals(STAMP, f.coordinator.syncState.value.lastSyncedAt)
        }
    }

    @Test
    fun dismissingAnOlderResultDoesNotClearANewerCompletion() = runTest {
        withCoordinator { f ->
            f.coordinator.requestSync().await()
            val first = assertNotNull(f.coordinator.lastSyncResult.value)
            f.coordinator.requestSync().await()
            val second = assertNotNull(f.coordinator.lastSyncResult.value)
            f.coordinator.clearLastSyncResult(first)
            assertEquals(second, f.coordinator.lastSyncResult.value)
            f.coordinator.clearLastSyncResult(second)
            assertNull(f.coordinator.lastSyncResult.value)
        }
    }

    private suspend fun TestScope.withCoordinator(block: suspend (Fixture) -> Unit) {
        val directory = Files.createTempDirectory("sync-coordinator-test-")
        val accounts = createTestAccounts(directory, StandardTestDispatcher(testScheduler))
        try {
            accounts.initialize()
            accounts.activate("production:a")
            block(Fixture(accounts, backgroundScope))
        } finally {
            backgroundScope.coroutineContext[kotlinx.coroutines.Job]?.cancelAndJoin()
            accounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private class Fixture(val accounts: AccountDataStore, scope: CoroutineScope) {
        val auth = FakeAuth()
        val fetchCursors = mutableListOf<String?>()
        var signOuts = 0
        var beforeSignOut: suspend () -> Unit = {}
        var onFetch: suspend () -> Result<SyncGetResponse> = { Result.success(response()) }
        var onSend: suspend () -> Result<SyncPostResponse> = {
            Result.success(SyncPostResponse(emptyList(), emptyList(), STAMP))
        }
        private val remote = object : SyncRemote {
            override suspend fun fetchSyncData(token: String, lastSyncedAt: String?, workCursor: Long?, limit: Int?): Result<SyncGetResponse> {
                fetchCursors.add(lastSyncedAt)
                return onFetch()
            }
            override suspend fun sendSyncData(token: String, request: SyncPostRequest) = onSend()
        }
        private val repository = SyncRepository(remote, auth, FavouriteTagRepository(accounts), SavedSearchRepository(accounts), accounts)
        val coordinator = SyncCoordinator(repository, auth, accounts, signOut = { isCurrent ->
            beforeSignOut()
            if (!isCurrent()) throw CancellationException("Account changed")
            signOuts++
            auth.invalidateSession()
            accounts.activate(AccountDataStore.GUEST)
        }, scope = scope)

        suspend fun seedWork() = accounts.edit {
            accounts.database.workDao().upsertWork(WorkEntity(id = 1, lastRead = 100, rowCreatedAt = 100, rowUpdatedAt = 100))
        }

        suspend fun switchAccount(owner: String) {
            auth.owner = owner
            accounts.activate(owner)
        }
    }

    private class FakeAuth : SyncAuthentication {
        var owner = "production:a"
        override val authState = MutableStateFlow<AuthState>(AuthState.Authenticated(null, "token"))
        override fun currentOwner() = owner
        override fun isCurrentSession(token: String, owner: String) =
            authState.value is AuthState.Authenticated && token == "token" && this.owner == owner
        override suspend fun invalidateSession() { authState.value = AuthState.Idle }
    }

    companion object {
        private const val STAMP = "2026-10-02T00:00:00Z"
        private fun response() = SyncGetResponse(emptyList(), emptyList(), serverLastUpdated = STAMP, hasMore = false)
    }
}
