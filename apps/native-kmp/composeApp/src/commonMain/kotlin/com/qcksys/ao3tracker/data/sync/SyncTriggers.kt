package com.qcksys.ao3tracker.data.sync

import com.qcksys.ao3tracker.util.AppLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch

/**
 * Centralises auto-sync triggers fired in response to local user actions.
 *
 * Favourite-tag toggles sync immediately so the change reaches the server (and
 * any other devices) without delay. The implementation owns its own
 * [CoroutineScope] tied to a [SupervisorJob] so a failed sync attempt doesn't
 * tear down later attempts.
 */
class SyncTriggers(
    private val syncRepository: SyncRepository
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val favouritesPing = MutableSharedFlow<Unit>(extraBufferCapacity = 16)

    companion object {
        private const val TAG = "SyncTriggers"
    }

    init {
        scope.launch {
            favouritesPing.collect {
                AppLogger.d("Favourite-tag changed, syncing", TAG)
                syncRepository.sync()
            }
        }
    }

    /** Mark a favourite-tag toggle; sync fires straight away. */
    fun notifyFavouriteChanged() {
        favouritesPing.tryEmit(Unit)
    }
}
