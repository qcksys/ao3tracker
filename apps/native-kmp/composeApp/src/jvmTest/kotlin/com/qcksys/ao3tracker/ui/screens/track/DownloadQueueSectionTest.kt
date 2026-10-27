package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.qcksys.ao3tracker.data.database.OfflineJobEntity
import com.qcksys.ao3tracker.data.database.OfflineWorkEntity
import com.qcksys.ao3tracker.data.offline.OfflineCaptureRequest
import com.qcksys.ao3tracker.data.offline.OfflineDownloadRequest
import com.qcksys.ao3tracker.data.offline.OfflineWorkStatus
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class DownloadQueueSectionTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun queueShowsTheActiveChapterAndActionsForWaitingDownloads() {
        val opened = mutableListOf<Long>()
        val retried = mutableListOf<Long>()
        val capture = OfflineCaptureRequest("https://archiveofourown.org/works/1/chapters/10", "user", { true }, { _, _ -> error("unused") },
            publish = {}, onFailure = { _, _ -> }, onProgress = {})
        val active = OfflineDownloadRequest("id", 1, capture.url, capture, mode = "update", done = 1, total = 3)
        rule.setContent {
            MaterialTheme {
                DownloadQueueSection(listOf(status(1, "Updating", "running"), status(2, "Waiting", "queued"), status(3, "Stopped", "failed")),
                    active, onOpenLive = { opened += it }, onRetry = { retried += it })
            }
        }

        rule.onNodeWithText("Updating chapter 2 of 3").assertExists()
        rule.onNodeWithText("Queued · waiting for a connection or retry").assertExists()
        rule.onNodeWithText("Open on AO3").performClick()
        rule.onNodeWithText("Retry download").performClick()
        assertEquals(listOf(2L), opened)
        assertEquals(listOf(3L), retried)
    }

    @Test
    fun emptyQueueSaysNothingIsDownloading() {
        rule.setContent { MaterialTheme { DownloadQueueSection(emptyList(), null, onOpenLive = {}, onRetry = {}) } }
        rule.onNodeWithText("No downloads in progress.").assertExists()
    }

    private fun status(workId: Long, title: String, state: String) = OfflineWorkStatus(
        OfflineWorkEntity("context", workId, title, "[]", true, 1), emptyList(), emptySet(),
        OfflineJobEntity("job-$workId", "context", workId, "save", "[]", "[]", state, 0, 0, null, 1), 0)
}
