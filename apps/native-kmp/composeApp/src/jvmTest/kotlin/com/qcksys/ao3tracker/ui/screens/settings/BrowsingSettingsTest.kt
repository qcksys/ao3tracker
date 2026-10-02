package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.qcksys.ao3tracker.data.settings.AppSettings
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class BrowsingSettingsTest {
    @get:Rule
    val rule = createComposeRule()

    private fun showSettings(settings: AppSettings) {
        rule.setContent {
            MaterialTheme {
                Column(Modifier.verticalScroll(rememberScrollState())) { BrowsingSettings(settings, onOpenHiddenWorks = {}) }
            }
        }
    }

    @Test
    fun selectsLanguageAndTogglesFiltering() {
        val settings = AppSettings(null)
        showSettings(settings)
        rule.onNodeWithText("Search preferences").performClick()
        rule.onNodeWithText("English").performClick()
        rule.onNodeWithText("Français").performScrollTo().performClick()
        assertEquals("fr", settings.browsingPreferences.value.searchLanguage)
        assertEquals(false, settings.browsingPreferences.value.languageFilterEnabled)
        rule.onNodeWithContentDescription("Filter searches by language").performClick()
        assertEquals(true, settings.browsingPreferences.value.languageFilterEnabled)
        rule.onNodeWithContentDescription("Filter searches by language").performClick()
        assertEquals(false, settings.browsingPreferences.value.languageFilterEnabled)
        assertEquals("fr", settings.browsingPreferences.value.searchLanguage)
    }

    @Test
    fun validatesSavesAndClearsFandomLimits() {
        val settings = AppSettings(null)
        showSettings(settings)
        rule.onNodeWithText("Search preferences").performClick()
        val field = rule.onNodeWithText("Maximum fandoms per work")
        field.performTextReplacement("0")
        rule.onNodeWithText("Save fandom limit").assertIsNotEnabled()
        field.performTextReplacement("1.5")
        rule.onNodeWithText("Save fandom limit").assertIsNotEnabled()
        field.performTextReplacement("3")
        rule.onNodeWithText("Search preferences").performScrollTo().performClick()
        rule.onNodeWithText("Search preferences").performClick()
        field.assertTextContains("3")
        rule.onNodeWithText("Save fandom limit").performScrollTo().performClick()
        assertEquals(3, settings.browsingPreferences.value.maxFandoms)
        field.performScrollTo().performTextReplacement("1")
        rule.onNodeWithText("Save fandom limit").performScrollTo().performClick()
        assertEquals(1, settings.browsingPreferences.value.maxFandoms)
        field.performScrollTo().performTextReplacement("")
        rule.onNodeWithText("Save fandom limit").performScrollTo().performClick()
        assertEquals(null, settings.browsingPreferences.value.maxFandoms)
    }

    @Test
    fun preservesTagDraftAndShowsOnlyHiddenWorkCount() {
        val settings = AppSettings(null)
        settings.setWorkHidden(123, true)
        showSettings(settings)
        rule.onNodeWithText("Add tags").assertDoesNotExist()
        rule.onNodeWithText("Search preferences").performClick()
        rule.onNodeWithText("Add excluded tags").performScrollTo().performTextReplacement("Angst\nFluff")
        rule.onNodeWithText("Search preferences").performScrollTo().performClick()
        rule.onNodeWithText("Search preferences").performClick()
        rule.onNodeWithText("Add excluded tags").assertTextContains("Angst\nFluff")
        rule.onNodeWithText("Add tags").performScrollTo().performClick()
        assertEquals(listOf("Angst", "Fluff"), settings.browsingPreferences.value.hiddenTags)
        rule.onNodeWithContentDescription("Remove Angst").performScrollTo().performClick()
        assertEquals(listOf("Fluff"), settings.browsingPreferences.value.hiddenTags)
        rule.onNodeWithText("Unhide").assertDoesNotExist()
        rule.onNodeWithText("Hidden works (1)").performScrollTo().assertExists()
        rule.onNodeWithContentDescription("Hide caught-up and finished works").performScrollTo().performClick()
        assertEquals(true, settings.browsingPreferences.value.hideCaughtUp)
    }
}
