package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.model.Work
import org.junit.Rule
import org.junit.Test

class WorkCardTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun updateAndReadTimesRemainVisibleOnNarrowCards() {
        val now = kotlin.time.Clock.System.now().toEpochMilliseconds()
        val work = Work(
            id = 1,
            lastUpdated = now - 12 * 24 * 60 * 60 * 1000L,
            lastRead = now - 2 * 60 * 60 * 1000L,
            rowCreatedAt = now,
            rowUpdatedAt = now
        )
        rule.setContent {
            MaterialTheme {
                Box(Modifier.width(280.dp)) {
                    WorkCard(work, onClick = {}, onFavourite = {}, onDetails = {})
                }
            }
        }

        rule.onNodeWithText("Chapters: 0/?", useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithText("Updated: 12 days ago", useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithText("Read: 2 hours ago", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun workWithoutTimestampsDoesNotShowDateLabels() {
        val work = Work(id = 1, rowCreatedAt = 0, rowUpdatedAt = 0)
        rule.setContent {
            MaterialTheme {
                WorkCard(work, onClick = {}, onFavourite = {}, onDetails = {})
            }
        }

        rule.onNodeWithText("Chapters: 0/?", useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithText("Updated:", substring = true, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithText("Read:", substring = true, useUnmergedTree = true).assertDoesNotExist()
    }
}
