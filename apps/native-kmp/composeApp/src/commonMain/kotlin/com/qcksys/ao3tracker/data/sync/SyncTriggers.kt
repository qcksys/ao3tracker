package com.qcksys.ao3tracker.data.sync

import com.qcksys.ao3tracker.util.AppLogger
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

/**
 * Centralises debounced auto-sync triggers fired in response to local user actions.
 *
 * Today: only the favourite-tag toggle triggers an auto-sync. The 2-second debounce
 * lets the user batch-favourite several tags in a row without spamming the server.
 *
 * The implementation owns its own [CoroutineScope] tied to a [SupervisorJob] so a
 * failed sync attempt doesn't tear down later attempts.
 */
@OptIn(FlowPreview::class)
class SyncTriggers(
    private val syncRepository: SyncRepository
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val favouritesPing = MutableSharedFlow<Unit>(extraBufferCapacity = 16)

    companion object {
        private const val TAG = "SyncTriggers"
        private val DEBOUNCE = 2.seconds
    }

    init {
        scope.launch {
            favouritesPing
                .debounce(DEBOUNCE)
                .collect {
                    AppLogger.d("Favourite-tag change settled, syncing", TAG)
                    syncRepository.sync()
                }
        }
    }

    /** Mark a favourite-tag toggle; sync will fire after the debounce window. */
    fun notifyFavouriteChanged() {
        favouritesPing.tryEmit(Unit)
    }
}
