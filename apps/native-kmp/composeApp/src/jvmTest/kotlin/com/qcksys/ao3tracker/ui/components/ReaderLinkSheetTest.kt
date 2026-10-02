package com.qcksys.ao3tracker.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test

class ReaderLinkSheetTest {
    @get:Rule
    val rule = createComposeRule()
    private val actions = mutableListOf<ReaderLinkAction>()
    private var dismissed = false
    private var copied = false
    private var opened = false

    @Test
    fun workMenuTracksThePressedWorkAndDismisses() {
        show(ReaderLink("https://archiveofourown.org/works/123", "A work"))
        rule.onNodeWithText("A work").assertExists()
        rule.onNodeWithText("Add to blocklist").assertDoesNotExist()
        rule.onNodeWithText("Hide / add to blocklist").assertExists()
        rule.onNodeWithText("Add to tracked works").performClick()
        assertEquals(listOf<ReaderLinkAction>(ReaderLinkAction.TrackWork(123, "A work")), actions)
        assertTrue(dismissed)
    }

    @Test
    fun workMenuBlocksThePressedWork() {
        show(ReaderLink("https://archiveofourown.org/works/123/chapters/456"))
        rule.onNodeWithText("Hide / add to blocklist").performClick()
        assertEquals(listOf<ReaderLinkAction>(ReaderLinkAction.BlockWork(123)), actions)
        assertTrue(dismissed)
    }

    @Test
    fun tagMenuBlocksTheDecodedTag() {
        show(ReaderLink("https://archiveofourown.org/tags/Alice*s*Bob/works"))
        rule.onNodeWithText("Alice/Bob").assertExists()
        rule.onNodeWithText("Add to tracked works").assertDoesNotExist()
        rule.onNodeWithText("Add to blocklist").performClick()
        assertEquals(listOf<ReaderLinkAction>(ReaderLinkAction.BlockTag("Alice/Bob")), actions)
        assertTrue(dismissed)
    }

    @Test
    fun otherLinksKeepCopyAndBrowserActions() {
        show(ReaderLink("https://example.com/works/123"))
        rule.onNodeWithText("Add to tracked works").assertDoesNotExist()
        rule.onNodeWithText("Add to blocklist").assertDoesNotExist()
        rule.onNodeWithText("Hide / add to blocklist").assertDoesNotExist()
        rule.onNodeWithText("Copy").performClick()
        assertTrue(copied)
        assertTrue(dismissed)
        rule.onNodeWithText("Open in browser").performClick()
        assertTrue(opened)
    }

    private fun show(link: ReaderLink) {
        rule.setContent {
            MaterialTheme {
                ReaderLinkSheet(
                    link = link,
                    onDismiss = { dismissed = true },
                    onCopy = { copied = true },
                    onOpenInBrowser = { opened = true },
                    onAction = { actions.add(it) }
                )
            }
        }
        rule.waitForIdle()
    }
}
