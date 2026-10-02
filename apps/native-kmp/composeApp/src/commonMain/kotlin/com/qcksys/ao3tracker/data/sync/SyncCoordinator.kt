package com.qcksys.ao3tracker.data.sync

import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.model.SyncResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SyncCompletion(val result: SyncResult, val signedOut: Boolean = false)

class SyncCoordinator(
    private val repository: SyncRepository,
    private val auth: SyncAuthentication,
    private val accounts: AccountDataStore,
    private val signOut: suspend (isCurrentSession: () -> Boolean) -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
) {
    private val mutex = Mutex()
    val syncState = repository.syncState
    private val _lastSyncResult = MutableStateFlow<SyncCompletion?>(null)
    val lastSyncResult = _lastSyncResult.asStateFlow()
    private val _isSigningOut = MutableStateFlow(false)
    val isSigningOut = _isSigningOut.asStateFlow()

    fun requestSync(forceFull: Boolean = false, showResult: Boolean = true): Deferred<SyncResult> =
        submit(forceFull, signOutAfterSync = false, showResult = showResult)

    fun requestSignOut(): Deferred<SyncResult> = submit(forceFull = true, signOutAfterSync = true, showResult = true)

    fun clearLastSyncResult(completion: SyncCompletion) {
        _lastSyncResult.compareAndSet(completion, null)
    }

    private fun submit(forceFull: Boolean, signOutAfterSync: Boolean, showResult: Boolean): Deferred<SyncResult> {
        val requestedAuth = auth.authState.value
        val requestedOwner = auth.currentOwner()
        val requestedGeneration = accounts.generation
        return scope.async {
            mutex.withLock {
                if (auth.authState.value != requestedAuth || auth.currentOwner() != requestedOwner ||
                    accounts.generation != requestedGeneration
                ) return@withLock SyncResult.NotAuthenticated

                if (showResult) _lastSyncResult.value = null
                _isSigningOut.value = signOutAfterSync
                var signedOut = false
                val result = try {
                    if (!auth.prepareSession()) {
                        SyncResult.NotAuthenticated
                    } else {
                        val token = (auth.authState.value as? AuthState.Authenticated)?.token
                        val owner = auth.currentOwner()
                        val generation = accounts.generation
                        if (token == null || owner == null ||
                            token != (requestedAuth as? AuthState.Authenticated)?.token ||
                            (requestedOwner != null && (owner != requestedOwner || generation != requestedGeneration)) ||
                            (signOutAfterSync && requestedOwner == null)
                        ) {
                            SyncResult.NotAuthenticated
                        } else {
                            val isCurrent = { auth.isCurrentSession(token, owner) && accounts.generation == generation }
                            val synced = repository.sync(forceFull, clearOnSuccess = signOutAfterSync, isCurrentOperation = isCurrent)
                            if (synced is SyncResult.Success && signOutAfterSync) {
                                if (!isCurrent()) throw CancellationException("Account changed")
                                signOut(isCurrent)
                                signedOut = true
                            }
                            synced
                        }
                    }
                } catch (e: CancellationException) {
                    currentCoroutineContext().ensureActive()
                    SyncResult.NotAuthenticated
                } catch (e: Exception) {
                    SyncResult.Error(e.message ?: "Sync failed")
                } finally {
                    _isSigningOut.value = false
                }
                if (showResult) _lastSyncResult.value = SyncCompletion(result, signedOut)
                result
            }
        }
    }
}
