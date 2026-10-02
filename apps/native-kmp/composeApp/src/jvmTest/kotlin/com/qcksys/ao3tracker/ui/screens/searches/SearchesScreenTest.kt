package com.qcksys.ao3tracker.ui.screens.searches

import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.Clipboard
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.asAwtTransferable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import com.qcksys.ao3tracker.data.database.SearchCheckEntity
import java.awt.datatransfer.DataFlavor
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test

class SearchesScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val search = SavedSearchEntity(
        id = "saved-search",
        name = "Favourite stories",
        url = "https://archiveofourown.org/works?work_search[query]=favourites",
        deleted = false,
        updatedAt = 1L,
        pendingSync = false
    )

    @Test
    fun showsFiveTagsAndOverflowBelowAFullWidthNameOnNarrowScreens() {
        val saved = search.copy(
            name = "Favourite stories with a long descriptive name",
            url = "https://archiveofourown.org/works?work_search[other_tag_names]=Fluff,Caf%C3%A9,Slow+Burn,Friendship,Happy+Ending,Angst,Humour"
        )
        rule.setContent {
            MaterialTheme {
                Box(Modifier.width(320.dp)) {
                    SearchesScreenContent(
                        searches = listOf(saved),
                        onOpen = {}, onRename = { _, _ -> }, onDelete = {}
                    )
                }
            }
        }
        listOf("Fluff", "Café", "Slow Burn", "Friendship", "Happy Ending", "+2 more").forEach {
            rule.onNodeWithText(it).assertIsDisplayed()
        }
        rule.onNodeWithText("Angst").assertDoesNotExist()
        rule.onNodeWithText("Humour").assertDoesNotExist()
        rule.onNodeWithText(saved.url).assertDoesNotExist()
        val name = rule.onNodeWithText(saved.name, useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val tag = rule.onNodeWithText("Fluff", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val copy = rule.onNodeWithContentDescription("Copy link for ${saved.name}").fetchSemanticsNode().boundsInRoot
        assertTrue(name.width >= with(rule.density) { 288.dp.toPx() })
        assertTrue(tag.top >= name.bottom)
        assertTrue(copy.top >= tag.bottom)
    }

    @Test
    fun hidesOverflowAtFiveTagsAndOmitsEmptyTagPreviews() {
        val url = mutableStateOf("https://archiveofourown.org/works?work_search[tag_names]=One,Two,Three,Four,Five")
        rule.setContent {
            MaterialTheme {
                SearchesScreenContent(
                    searches = listOf(search.copy(url = url.value)),
                    onOpen = {}, onRename = { _, _ -> }, onDelete = {}
                )
            }
        }
        rule.onNodeWithText("Five").assertIsDisplayed()
        rule.onNodeWithText("more", substring = true).assertDoesNotExist()
        rule.runOnIdle { url.value = "https://archiveofourown.org/works" }
        rule.onNodeWithText("One").assertDoesNotExist()
        rule.onNodeWithText("more", substring = true).assertDoesNotExist()
        rule.onNodeWithText(search.name).assertIsDisplayed()
    }

    @OptIn(ExperimentalComposeUiApi::class)
    @Test
    fun copiesTheSelectedSearchUrlWithoutOpeningOrEditingIt() {
        val searches = listOf(
            search.copy(url = "https://archiveofourown.org/works?work_search%5Bquery%5D=slow+burn&page=2#work_123"),
            search.copy(id = "bookmarks", name = "Saved bookmarks", url = "https://archiveofourown.org/bookmarks?bookmark_search%5Bother_tag_names%5D=Fluff%2C+Caf%C3%A9")
        )
        val copied = mutableListOf<String>()
        val clipboard = object : Clipboard {
            override val nativeClipboard: Any = Unit
            override suspend fun getClipEntry(): ClipEntry? = null
            override suspend fun setClipEntry(clipEntry: ClipEntry?) {
                copied.add(clipEntry!!.asAwtTransferable!!.getTransferData(DataFlavor.stringFlavor) as String)
            }
        }
        rule.setContent {
            CompositionLocalProvider(LocalClipboard provides clipboard) {
                MaterialTheme {
                    SearchesScreenContent(
                        searches = searches,
                        onOpen = { error("Copy must not open the search") },
                        onRename = { _, _ -> error("Copy must not rename the search") },
                        onDelete = { error("Copy must not delete the search") }
                    )
                }
            }
        }

        searches.forEach { savedSearch ->
            rule.onNodeWithContentDescription("Copy link for ${savedSearch.name}").performClick()
            rule.onNodeWithText("Link copied").assertIsDisplayed()
        }
        assertEquals(searches.map { it.url }, copied)
    }

    @Test
    fun showsClipboardFailureAndAllowsRetry() {
        var fail = true
        val clipboard = object : Clipboard {
            override val nativeClipboard: Any = Unit
            override suspend fun getClipEntry(): ClipEntry? = null
            override suspend fun setClipEntry(clipEntry: ClipEntry?) {
                if (fail) throw IllegalStateException("Clipboard unavailable")
            }
        }
        rule.setContent {
            CompositionLocalProvider(LocalClipboard provides clipboard) {
                MaterialTheme {
                    SearchesScreenContent(
                        searches = listOf(search),
                        onOpen = {}, onRename = { _, _ -> }, onDelete = {}
                    )
                }
            }
        }

        rule.onNodeWithContentDescription("Copy link for ${search.name}").performClick()
        rule.onNodeWithText("Couldn't copy link. Try again.").assertIsDisplayed()
        rule.onNodeWithText("Link copied").assertDoesNotExist()

        fail = false
        rule.onNodeWithContentDescription("Copy link for ${search.name}").performClick()
        rule.onNodeWithText("Link copied").assertIsDisplayed()
        rule.onNodeWithText("Couldn't copy link. Try again.").assertDoesNotExist()
    }

    @Test
    fun opensRenamesAndDeletesSavedSearches() {
        val searches = mutableStateOf(listOf(search))
        val opened = mutableListOf<String>()
        val renamed = mutableListOf<Pair<String, String>>()
        val deleted = mutableListOf<String>()
        rule.setContent {
            MaterialTheme {
                SearchesScreenContent(
                    searches = searches.value,
                    onOpen = { opened.add(it) },
                    onRename = { id, name ->
                        renamed.add(id to name)
                        searches.value = searches.value.map { if (it.id == id) it.copy(name = name) else it }
                    },
                    onDelete = { id ->
                        deleted.add(id)
                        searches.value = searches.value.filterNot { it.id == id }
                    }
                )
            }
        }

        rule.onNodeWithText("Searches").assertIsDisplayed()
        rule.onNodeWithText(search.name).performClick()
        assertEquals(listOf(search.url), opened)

        rule.onNodeWithContentDescription("Rename ${search.name}").performClick()
        rule.onNode(hasSetTextAction()).performTextReplacement("Updated search")
        rule.onNodeWithText("Save").performClick()
        assertEquals(listOf(search.id to "Updated search"), renamed)
        rule.onNodeWithText("Updated search").assertIsDisplayed()
        rule.onNodeWithText("Rename search").assertDoesNotExist()

        rule.onNodeWithContentDescription("Delete Updated search").performClick()
        assertEquals(listOf(search.id), deleted)
        assertEquals(listOf(search.url), opened)
        rule.onNodeWithText("Updated search").assertDoesNotExist()
        rule.onNodeWithText("No saved searches yet.", substring = true).assertIsDisplayed()
        rule.onNodeWithText("Save this search", substring = true).assertIsDisplayed()
    }

    @Test
    fun showsLocalCountsAndKeepsThemVisibleWhenACheckFails() {
        val checked = mutableListOf<String>()
        val snapshot = SearchCheckEntity(search.id, search.url, "query", "[]", 1000, 500, 3, 2)
        rule.setContent {
            MaterialTheme {
                SearchesScreenContent(
                    searches = listOf(search),
                    onOpen = {}, onRename = { _, _ -> }, onDelete = {},
                    checks = mapOf(search.id to snapshot),
                    errors = mapOf(search.id to "AO3 returned 429. Please try again later."),
                    onCheck = { checked.add(it) }
                )
            }
        }
        rule.onNodeWithText("3 newly found · 2 updated works").assertIsDisplayed()
        rule.onNodeWithText("Checked ", substring = true).assertIsDisplayed()
        rule.onNodeWithText("AO3 returned 429.", substring = true).assertIsDisplayed()
        rule.onNodeWithContentDescription("Check ${search.name}").performClick()
        assertEquals(listOf(search.id), checked)
    }

    @Test
    fun cancellingOrEnteringABlankNameKeepsTheSearchUnchanged() {
        val renamed = mutableListOf<Pair<String, String>>()
        rule.setContent {
            MaterialTheme {
                SearchesScreenContent(
                    searches = listOf(search),
                    onOpen = {},
                    onRename = { id, name -> renamed.add(id to name) },
                    onDelete = {}
                )
            }
        }

        rule.onNodeWithContentDescription("Rename ${search.name}").performClick()
        rule.onNode(hasSetTextAction()).performTextReplacement("   ")
        rule.onNodeWithText("Save").assertIsNotEnabled()
        rule.onNodeWithText("Cancel").performClick()
        rule.onNodeWithText(search.name).assertIsDisplayed()
        rule.onNodeWithText("Rename search").assertDoesNotExist()
        assertEquals(emptyList(), renamed)
    }
}
