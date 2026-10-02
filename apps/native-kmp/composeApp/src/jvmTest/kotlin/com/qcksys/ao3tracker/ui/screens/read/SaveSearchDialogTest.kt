package com.qcksys.ao3tracker.ui.screens.read

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class SaveSearchDialogTest {
    @get:Rule
    val rule = createComposeRule()

    private val search = SavedSearchEntity("saved-search", "My stories", "https://archiveofourown.org/works", false, 1L, false)

    @Test
    fun updatesAnExplicitlySelectedSearchWithoutCreatingOne() {
        val updated = mutableListOf<String>()
        rule.setContent {
            MaterialTheme {
                SaveSearchDialog("New filters", listOf(search), { error("Must not create") }, { updated.add(it) }, {})
            }
        }
        rule.onNodeWithText("Update saved search to match").performClick()
        rule.onNodeWithText("Update").assertIsNotEnabled()
        rule.onNodeWithText("Choose saved search").performClick()
        rule.onNodeWithText(search.name).performClick()
        rule.onNodeWithText("Update").performClick()
        assertEquals(listOf(search.id), updated)
    }

    @Test
    fun preservesNewSearchNamingWhenSwitchingBack() {
        val created = mutableListOf<String>()
        rule.setContent {
            MaterialTheme {
                SaveSearchDialog("Suggested name", listOf(search), { created.add(it) }, { error("Must not update") }, {})
            }
        }
        rule.onNode(hasSetTextAction()).performTextReplacement("My new search")
        rule.onNodeWithText("Update saved search to match").performClick()
        rule.onNodeWithText("Save as new search instead").performClick()
        rule.onNodeWithText("My new search").assertIsDisplayed()
        rule.onNodeWithText("Save").performClick()
        assertEquals(listOf("My new search"), created)
    }

    @Test
    fun deletedSelectionDisablesUpdateAndCancelDoesNotSave() {
        val searches = mutableStateOf(listOf(search))
        var cancelled = false
        rule.setContent {
            MaterialTheme {
                SaveSearchDialog("Filters", searches.value, { error("Must not create") }, { error("Must not update") }, { cancelled = true })
            }
        }
        rule.onNodeWithText("Update saved search to match").performClick()
        rule.onNodeWithText("Choose saved search").performClick()
        rule.onNodeWithText(search.name).performClick()
        rule.runOnIdle { searches.value = listOf(search.copy(deleted = true)) }
        rule.onNodeWithText("Update").assertIsNotEnabled()
        rule.onNodeWithText("Cancel").performClick()
        assertEquals(true, cancelled)
    }

    @Test
    fun noLiveSearchesKeepsOnlyNewSearchAndBlankNamesCannotSave() {
        rule.setContent {
            MaterialTheme {
                SaveSearchDialog("Filters", listOf(search.copy(deleted = true)), {}, {}, {})
            }
        }
        rule.onNodeWithText("Update saved search to match").assertDoesNotExist()
        rule.onNode(hasSetTextAction()).performTextReplacement("   ")
        rule.onNodeWithText("Save").assertIsNotEnabled()
    }
}
