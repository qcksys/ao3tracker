package com.qcksys.ao3tracker.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.qcksys.ao3tracker.data.offline.DownloadDebugEntry
import org.junit.Rule
import org.junit.Test

class DownloadDebugDialogTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun progressUpdatesLiveRetainsFailuresAndCanBeDismissed() {
        val entries = mutableStateOf(emptyList<DownloadDebugEntry>())
        val visible = mutableStateOf(true)
        rule.setContent {
            MaterialTheme {
                if (visible.value) DownloadDebugContent(null, entries.value, "Connected · Wi-Fi", 0) { visible.value = false }
            }
        }
        rule.onNodeWithText("No download details yet. Start a download to see progress.").assertIsDisplayed()
        rule.runOnIdle {
            entries.value = (1..100).map { DownloadDebugEntry("2026-10-04T00:00:00Z", "Stored resource $it") } +
                DownloadDebugEntry("2026-10-04T00:01:00Z", "The stylesheet could not be downloaded.")
        }
        rule.onNodeWithText("The stylesheet could not be downloaded.").assertIsDisplayed()
        rule.onNodeWithText("Stored resource 1").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Close").performClick()
        rule.onNodeWithText("Download debug progress").assertDoesNotExist()
    }
}
