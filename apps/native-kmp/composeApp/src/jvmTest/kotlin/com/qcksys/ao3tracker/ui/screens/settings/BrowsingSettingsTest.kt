package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.qcksys.ao3tracker.data.settings.AppSettings
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class BrowsingSettingsTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun preservesDraftWhileCollapsedAndRestoresHiddenWorks() {
        val settings = AppSettings(null)
        settings.setWorkHidden(123, true)
        rule.setContent {
            MaterialTheme { BrowsingSettings(settings) }
        }

        rule.onNodeWithText("Save hidden tags").assertDoesNotExist()
        rule.onNodeWithText("Search preferences").performClick()
        rule.onNode(hasSetTextAction()).performTextReplacement("Angst\nFluff")
        rule.onNodeWithText("Search preferences").performClick()
        rule.onNodeWithText("Search preferences").performClick()
        rule.onNode(hasSetTextAction()).assertTextContains("Angst\nFluff")
        rule.onNodeWithText("Save hidden tags").performClick()
        assertEquals(listOf("Angst", "Fluff"), settings.browsingPreferences.value.hiddenTags)
        rule.onNodeWithText("Unhide").performClick()
        assertEquals(emptyList(), settings.browsingPreferences.value.hiddenWorkIds)
        rule.onNodeWithText("Hidden works (0)").assertExists()
    }
}
