package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.model.Tag
import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.data.model.Work
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test

class WorkCardTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun metadataFitsOnOneLineOnNarrowCards() {
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

        val bounds = listOf("Chapters: 0/?", "Updated: 12 days ago", "Read: 2 hours ago").map {
            rule.onNodeWithContentDescription(it, useUnmergedTree = true)
                .assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        }
        assertEquals(bounds[0].center.y, bounds[1].center.y)
        assertEquals(bounds[0].center.y, bounds[2].center.y)
        assertTrue(bounds[0].right <= bounds[1].left)
        assertTrue(bounds[1].right <= bounds[2].left)

        for (text in listOf("0/?", "12d ago", "2h ago")) {
            val layouts = mutableListOf<TextLayoutResult>()
            rule.onNodeWithText(text, useUnmergedTree = true)
                .assertIsDisplayed()
                .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
            assertEquals(1, layouts.single().lineCount)
            assertFalse(layouts.single().isLineEllipsized(0), "$text should fit without truncation")
        }
    }

    @Test
    fun workWithoutTimestampsDoesNotShowDateLabels() {
        val work = Work(id = 1, rowCreatedAt = 0, rowUpdatedAt = 0)
        rule.setContent {
            MaterialTheme {
                WorkCard(work, onClick = {}, onFavourite = {}, onDetails = {})
            }
        }

        rule.onNodeWithContentDescription("Chapters: 0/?", useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithContentDescription("Updated:", substring = true, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithContentDescription("Read:", substring = true, useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun titleUsesFullWidthWithActionsBesideAuthorAndFandom() {
        val work = Work(
            id = 1,
            title = "A long work title that needs the full card width",
            author = "An author with a long name",
            favourite = true,
            tags = listOf(Tag(1, "A fandom with a long name", "", TagType.FANDOM.id, 0)),
            rowCreatedAt = 0,
            rowUpdatedAt = 0
        )
        var readClicks = 0
        var favouriteClicks = 0
        var detailsClicks = 0
        rule.setContent {
            MaterialTheme {
                Box(Modifier.width(280.dp)) {
                    WorkCard(
                        work,
                        onClick = { readClicks++ },
                        onFavourite = { favouriteClicks++ },
                        onDetails = { detailsClicks++ }
                    )
                }
            }
        }

        val title = rule.onNodeWithText(work.title!!, useUnmergedTree = true)
            .assertWidthIsEqualTo(256.dp).fetchSemanticsNode().boundsInRoot
        val author = rule.onNodeWithText("by ${work.author}", useUnmergedTree = true)
            .fetchSemanticsNode().boundsInRoot
        val fandom = rule.onNodeWithText(work.tags.single().tag, useUnmergedTree = true)
            .fetchSemanticsNode().boundsInRoot
        val favourite = rule.onNodeWithContentDescription("Remove from favourites")
        val details = rule.onNodeWithContentDescription("Details")
        for (action in listOf(favourite, details)) {
            val bounds = action.assertIsDisplayed().fetchSemanticsNode().boundsInRoot
            assertTrue(bounds.top >= title.bottom)
            assertTrue(bounds.left >= author.right)
            assertTrue(bounds.left >= fandom.right)
            assertTrue(bounds.center.y >= author.top && bounds.center.y <= fandom.bottom)
            action.performClick()
        }
        assertEquals(1, favouriteClicks)
        assertEquals(1, detailsClicks)
        assertEquals(0, readClicks)
        rule.onNodeWithText(work.title).performClick()
        assertEquals(1, readClicks)
    }
}
