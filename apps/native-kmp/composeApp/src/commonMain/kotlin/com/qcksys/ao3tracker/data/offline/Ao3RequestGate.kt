package com.qcksys.ao3tracker.data.offline

import io.ktor.http.fromHttpToGmtDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.time.Clock

class Ao3RequestGate(private val now: () -> Long = { Clock.System.now().toEpochMilliseconds() }) {
    private val mutex = Mutex()
    private val interactive = MutableStateFlow(false)
    private val pausedUntil = MutableStateFlow(0L)
    val cooldown = pausedUntil.asStateFlow()

    fun setInteractiveLoading(loading: Boolean) { interactive.value = loading }

    fun pause(retryAfter: String?): Long {
        val time = now()
        val seconds = retryAfter?.trim()?.toLongOrNull()?.takeIf { it >= 0 }
        val until = if (seconds != null) time + seconds.coerceAtMost((Long.MAX_VALUE - time) / 1000) * 1000
            else runCatching { retryAfter?.fromHttpToGmtDate()?.timestamp }.getOrNull() ?: (time + 60_000)
        pausedUntil.value = maxOf(pausedUntil.value, until, time + 1000)
        return pausedUntil.value
    }

    suspend fun <T> background(block: suspend () -> T): T = mutex.withLock {
        while (true) {
            interactive.first { !it }
            val remaining = pausedUntil.value - now()
            if (remaining <= 0 && !interactive.value) break
            if (remaining > 0) delay(minOf(remaining, 60_000))
        }
        block()
    }
}
