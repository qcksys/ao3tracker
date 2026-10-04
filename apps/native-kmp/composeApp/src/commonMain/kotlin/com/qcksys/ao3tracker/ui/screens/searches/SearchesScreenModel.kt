package com.qcksys.ao3tracker.ui.screens.searches

import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import com.qcksys.ao3tracker.data.database.SearchCheckEntity
import com.qcksys.ao3tracker.data.model.SearchCheckMessage
import com.qcksys.ao3tracker.data.offline.Ao3RequestGate
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.data.repository.SearchCheckRepository
import com.qcksys.ao3tracker.data.repository.SearchCheckRequest
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.BrowsingPreferences
import com.qcksys.ao3tracker.data.sync.SyncTriggers
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import com.qcksys.ao3tracker.util.JsonConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlin.time.Clock

data class RunningSearchCheck(
    val runId: Long,
    val request: SearchCheckRequest,
    val preferences: BrowsingPreferences,
    val pages: Int = 0,
    val fullScan: Boolean = false
)

class SearchesScreenModel(
    private val savedSearchRepository: SavedSearchRepository,
    private val syncTriggers: SyncTriggers,
    private val checkRepository: SearchCheckRepository,
    private val settings: AppSettings,
    private val now: () -> Long = { Clock.System.now().toEpochMilliseconds() },
    private val ao3Gate: Ao3RequestGate = Ao3RequestGate(now)
) : ScreenModel {
    val savedSearches: StateFlow<List<SavedSearchEntity>> = savedSearchRepository
        .observeLive()
        .stateIn(screenModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val checks: StateFlow<List<SearchCheckEntity>> = checkRepository.observeChecks()
        .stateIn(screenModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    private val _runningCheck = MutableStateFlow<RunningSearchCheck?>(null)
    val runningCheck = _runningCheck.asStateFlow()
    private val _isChecking = MutableStateFlow(false)
    val isChecking = _isChecking.asStateFlow()
    private val _errors = MutableStateFlow<Map<String, String>>(emptyMap())
    val errors = _errors.asStateFlow()
    private val _checkStatus = MutableStateFlow<String?>(null)
    val checkStatus = _checkStatus.asStateFlow()
    private var retryAt = 0L
    private var checkJob: Job? = null
    private var messages: Channel<SearchCheckMessage>? = null
    private var nextRunId = 0L

    fun checkAll(automatic: Boolean = false) = startChecks(null, automatic)

    fun checkSearch(id: String) = startChecks(id, false)

    fun fullScan(id: String) = startChecks(id, false, fullScan = true)

    private fun startChecks(id: String?, automatic: Boolean, fullScan: Boolean = false) {
        if (checkJob?.isCompleted == false) return
        retryAt = maxOf(retryAt, ao3Gate.cooldown.value)
        if (now() < retryAt) {
            _checkStatus.value = "AO3 checks are paused. Try again in ${(retryAt - now()) / 1000 + 1} seconds."
            return
        }
        _checkStatus.value = null
        _isChecking.value = true
        checkJob = screenModelScope.launch {
            try {
                var checkedAny = false
                for (search in checkRepository.liveSearches().filter { id == null || it.id == id }) {
                    try {
                        val request = checkRepository.capture(search.id)
                        if (automatic && request.previous?.url == search.url &&
                            now() - maxOf(request.previous.checkedAt, request.previous.attemptedAt) < 5 * 60_000) continue
                        if (checkedAny) delay(1500)
                        checkedAny = true
                        _errors.value -= search.id
                        ao3Gate.background {
                            val channel = Channel<SearchCheckMessage>(Channel.UNLIMITED)
                            messages = channel
                            _runningCheck.value = RunningSearchCheck(++nextRunId, request, settings.browsingPreferences.value, fullScan = fullScan)
                            while (true) {
                                val message = withTimeout(60_000) { channel.receive() }
                                when (message.type) {
                                    "searchCheckProgress" -> _runningCheck.value = _runningCheck.value?.copy(pages = message.pages)
                                    "searchCheckResult" -> {
                                        checkRepository.record(request, message)
                                        break
                                    }
                                    "searchCheckError" -> {
                                        message.retryAfterSeconds?.takeIf { it > 0 }?.let { seconds ->
                                            retryAt = ao3Gate.pause(seconds.toString())
                                            _checkStatus.value = "AO3 checks are paused. Try again in $seconds seconds."
                                            _errors.value += search.id to message.error
                                        }
                                        error(message.error)
                                    }
                                    else -> error("Could not read the search results.")
                                }
                            }
                        }
                    } catch (_: TimeoutCancellationException) {
                        _errors.value += search.id to "AO3 did not respond. Open the search or try again later."
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        _errors.value += search.id to (error.message ?: "Could not check this search.")
                    } finally {
                        _runningCheck.value = null
                        messages?.close()
                        messages = null
                    }
                    if (now() < ao3Gate.cooldown.value) break
                }
            } finally {
                _isChecking.value = false
            }
        }
    }

    fun onCheckMessage(runId: Long, body: String) {
        if (_runningCheck.value?.runId != runId) return
        val message = runCatching { JsonConfig.json.decodeFromString<SearchCheckMessage>(body) }
            .getOrElse { SearchCheckMessage(type = "searchCheckError", error = "Could not read the search results.") }
        messages?.trySend(message)
    }

    fun cancelChecks() {
        checkJob?.cancel()
        _runningCheck.value = null
    }

    fun openSearch(url: String) {
        cancelChecks()
        screenModelScope.launch {
            checkRepository.liveSearches().filter { it.url == url }.forEach { checkRepository.markViewed(it.id) }
            NavigationState.navigateToRead(url)
        }
    }

    fun renameSavedSearch(id: String, name: String) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        screenModelScope.launch {
            savedSearchRepository.rename(id, trimmed)
            syncTriggers.notifySavedSearchChanged()
        }
    }

    fun deleteSavedSearch(id: String) {
        if (_runningCheck.value?.request?.search?.id == id) cancelChecks()
        screenModelScope.launch {
            savedSearchRepository.delete(id)
            syncTriggers.notifySavedSearchChanged()
        }
    }
}
