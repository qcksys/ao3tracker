package com.qcksys.ao3tracker.ui.screens.workdetail

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.model.Chapter
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test

class ChapterCardTest {
    @get:Rule
    val rule = createComposeRule()

    private val now = kotlin.time.Clock.System.now().toEpochMilliseconds()
    private val chapter = Chapter(
        id = 2,
        workId = 1,
        number = 2,
        dateUpdated = now - 365 * 24 * 60 * 60 * 1000L,
        readProgress = 0.5f,
        lastReadAt = now - 2 * 60 * 60 * 1000L,
        rowCreatedAt = now,
        rowUpdatedAt = now
    )

    @Test
    fun publishedAndReadDatesFitOnOneLineOnNarrowCards() {
        showChapter(chapter)

        val published = rule.onNodeWithContentDescription("Published: 365 days ago", useUnmergedTree = true)
            .assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val read = rule.onNodeWithContentDescription("Read: 2 hours ago", useUnmergedTree = true)
            .assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val progress = rule.onNodeWithText("50%", useUnmergedTree = true)
            .assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertEquals(published.center.y, read.center.y)
        assertTrue(published.right <= read.left)
        assertTrue(published.top >= progress.bottom)

        for (text in listOf("365d ago", "2h ago")) {
            val layouts = mutableListOf<TextLayoutResult>()
            rule.onNodeWithText(text, useUnmergedTree = true)
                .assertIsDisplayed()
                .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
            assertEquals(1, layouts.single().lineCount)
            assertFalse(layouts.single().isLineEllipsized(0), "$text should fit without truncation")
        }
    }

    @Test
    fun unreadChapterShowsOnlyItsPublishedDate() {
        showChapter(chapter.copy(readProgress = null, lastReadAt = null))

        rule.onNodeWithText("Not started", useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithContentDescription("Published: 365 days ago", useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithContentDescription("Read:", substring = true, useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun missingPublishedDateStillShowsReadDate() {
        showChapter(chapter.copy(dateUpdated = null))

        rule.onNodeWithContentDescription("Published:", substring = true, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithContentDescription("Read: 2 hours ago", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun missingDatesDoNotFallBackToRecordTimestamps() {
        showChapter(chapter.copy(dateUpdated = null, lastReadAt = null))

        rule.onNodeWithContentDescription("Published:", substring = true, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithContentDescription("Read:", substring = true, useUnmergedTree = true).assertDoesNotExist()
    }

    private fun showChapter(chapter: Chapter) {
        rule.setContent {
            MaterialTheme {
                Box(Modifier.width(280.dp)) {
                    ChapterCard(
                        chapter,
                        onClick = {},
                        onMarkAsRead = {},
                        onMarkAsUnread = {},
                        onDelete = {}
                    )
                }
            }
        }
    }
}
