package com.qcksys.ao3tracker.data.offline

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class Ao3RequestGateTest {
    @Test
    fun backgroundRequestsShareTheCooldownAndWaitForInteractiveReading() = runTest {
        val gate = Ao3RequestGate { testScheduler.currentTime }
        gate.setInteractiveLoading(true)
        var ran = false
        launch { gate.background { ran = true } }
        runCurrent()
        assertFalse(ran)
        gate.pause("5")
        gate.setInteractiveLoading(false)
        advanceTimeBy(4999)
        assertFalse(ran)
        advanceTimeBy(1)
        runCurrent()
        assertTrue(ran)
    }

    @Test
    fun onlyOneBackgroundRequestRunsAndAnEarlierRetryDateCannotShortenACooldown() = runTest {
        val gate = Ao3RequestGate { 0 }
        val release = CompletableDeferred<Unit>()
        val order = mutableListOf<Int>()
        launch { gate.background { order.add(1); release.await() } }
        launch { gate.background { order.add(2) } }
        runCurrent()
        assertEquals(listOf(1), order)
        release.complete(Unit)
        runCurrent()
        assertEquals(listOf(1, 2), order)
        assertEquals(120_000, gate.pause("Thu, 01 Jan 1970 00:02:00 GMT"))
        assertEquals(120_000, gate.pause("2"))
    }
}
