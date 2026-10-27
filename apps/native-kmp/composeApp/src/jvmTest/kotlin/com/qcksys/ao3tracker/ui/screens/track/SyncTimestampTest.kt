package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import kotlin.time.Clock
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Instant

class SyncTimestampTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun elapsedTimeUpdatesWithoutOtherScreenChangesAndResetsAfterSync() {
        rule.mainClock.autoAdvance = false
        val initial = Instant.parse("2026-10-27T01:00:00Z")
        val timestamp = mutableStateOf(initial.toString())
        val clock = object : Clock {
            override fun now() = initial + rule.mainClock.currentTime.milliseconds
        }
        rule.setContent {
            MaterialTheme {
                Text(rememberSyncTimestamp(timestamp.value, clock))
            }
        }
        rule.onNodeWithText("Just now").assertIsDisplayed()

        rule.mainClock.advanceTimeBy(60_032)
        rule.onNodeWithText("1 min ago").assertIsDisplayed()

        rule.mainClock.advanceTimeBy(60_000)
        rule.onNodeWithText("2 min ago").assertIsDisplayed()

        rule.runOnIdle { timestamp.value = clock.now().toString() }
        rule.mainClock.advanceTimeByFrame()
        rule.onNodeWithText("Just now").assertIsDisplayed()

        rule.mainClock.advanceTimeBy(60_032)
        rule.onNodeWithText("1 min ago").assertIsDisplayed()
    }

    @Test
    fun updatesAtTheTimestampMinuteBoundaryAfterOpeningTheScreen() {
        rule.mainClock.autoAdvance = false
        val initial = Instant.parse("2026-10-27T01:00:00Z")
        val clock = object : Clock {
            override fun now() = initial + (59_000 + rule.mainClock.currentTime).milliseconds
        }
        rule.setContent {
            MaterialTheme {
                Text(rememberSyncTimestamp(initial.toString(), clock))
            }
        }
        rule.onNodeWithText("Just now").assertIsDisplayed()
        rule.mainClock.advanceTimeBy(1_032)
        rule.onNodeWithText("1 min ago").assertIsDisplayed()
    }
}
