package com.qcksys.ao3tracker.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.qcksys.ao3tracker.data.model.SyncDebugEntry
import com.qcksys.ao3tracker.data.model.SyncState
import org.junit.Rule
import org.junit.Test

class SyncDebugDialogTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun progressUpdatesLiveAndRemainsOpenAfterCompletionUntilDismissed() {
        val state = mutableStateOf(SyncState(isSyncing = true, statusMessage = "Fetching server page 1..."))
        val visible = mutableStateOf(true)
        rule.setContent {
            MaterialTheme {
                if (visible.value) SyncDebugDialog(state.value) { visible.value = false }
            }
        }
        rule.onNodeWithText("Fetching server page 1...").assertIsDisplayed()
        rule.runOnIdle {
            state.value = state.value.copy(
                statusMessage = "Sending batch 2...",
                debugEntries = listOf(SyncDebugEntry("2026-10-02T01:00:00Z", "Upload batch 1 acknowledged"))
            )
        }
        rule.onNodeWithText("Sending batch 2...").assertIsDisplayed()
        rule.onNodeWithText("Upload batch 1 acknowledged").assertIsDisplayed()
        rule.runOnIdle {
            state.value = state.value.copy(isSyncing = false, statusMessage = null, lastSyncedAt = "2026-10-02T01:00:01Z")
        }
        rule.onNodeWithText("Sync finished").assertIsDisplayed()
        rule.onNodeWithText("Upload batch 1 acknowledged").assertIsDisplayed()
        rule.onNodeWithText("Close").performClick()
        rule.onNodeWithText("Sync debug progress").assertDoesNotExist()
    }

    @Test
    fun failureShowsTheErrorAndEarlierStepsAreScrollable() {
        rule.setContent {
            MaterialTheme {
                SyncDebugDialog(
                    SyncState(
                        error = "Server unavailable",
                        debugEntries = (1..100).map {
                            SyncDebugEntry("2026-10-02T01:00:00Z", "Downloaded page $it")
                        }
                    ),
                    onDismiss = {}
                )
            }
        }
        rule.onNodeWithText("Server unavailable").assertIsDisplayed()
        rule.onNodeWithText("Downloaded page 100").assertIsDisplayed()
        rule.onNodeWithText("Downloaded page 1").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Close").assertIsDisplayed()
    }
}
