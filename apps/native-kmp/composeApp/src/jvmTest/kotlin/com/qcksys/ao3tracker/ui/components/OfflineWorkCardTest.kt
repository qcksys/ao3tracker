package com.qcksys.ao3tracker.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.qcksys.ao3tracker.data.database.OfflineJobEntity
import com.qcksys.ao3tracker.data.database.OfflineWorkEntity
import com.qcksys.ao3tracker.data.offline.OfflineChapter
import com.qcksys.ao3tracker.data.offline.OfflineWorkStatus
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class OfflineWorkCardTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun cardStartsCollapsedAndOffersAo3ForQueuedDownloads() {
        var opened = 0
        val chapter = OfflineChapter("10", 1, "Chapter 1", "https://archiveofourown.org/works/1/chapters/10")
        val download = OfflineWorkStatus(OfflineWorkEntity("context", 1, "Saved", "[]", true, 1), listOf(chapter), emptySet(),
            OfflineJobEntity("job", "context", 1, "save", "[]", "[]", "queued", 0, 0, null, 1), 0)
        rule.setContent {
            MaterialTheme {
                OfflineWorkCardContent(1, download, onSave = {}, onRetry = {}, onRemove = {}, onShowDebug = {}, onOpenLive = { opened++ })
            }
        }

        rule.onNodeWithText("Queued · waiting for a connection or retry").assertExists()
        rule.onNodeWithText("Update saved work").assertDoesNotExist()
        rule.onNodeWithText("Open on AO3").performClick()
        assertEquals(1, opened)

        rule.onNodeWithText("Offline reading").performClick()
        rule.onNodeWithText("Update saved work").assertExists()
        rule.onNodeWithText("Some chapters still need to download.").assertExists()
    }
}
