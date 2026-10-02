package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.qcksys.ao3tracker.data.settings.AppSettings
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class HiddenWorksTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun searchesTitlesAndIdsOpensWorksAndUnhidesWithoutOpening() {
        val settings = AppSettings(null)
        settings.setWorkHidden(123, true, "A Hidden Story")
        settings.setWorkHidden(456, true)
        var opened: Long? = null
        var wentBack = false
        rule.setContent {
            val preferences by settings.browsingPreferences.collectAsState()
            MaterialTheme {
                HiddenWorksContent(preferences, mapOf(456L to "Known title"),
                    onBack = { wentBack = true }, onOpen = { opened = it },
                    onUnhide = { settings.setWorkHidden(it, false) })
            }
        }
        rule.onNodeWithText("Known title").assertExists()
        rule.onNodeWithText("Search hidden works").performTextReplacement("hidden story")
        rule.onNodeWithText("Known title").assertDoesNotExist()
        rule.onNodeWithText("A Hidden Story").performClick()
        assertEquals(123L, opened)
        rule.onNodeWithText("Search hidden works").performTextReplacement("456")
        rule.onNodeWithContentDescription("Unhide Known title").performClick()
        assertEquals(listOf(123L), settings.browsingPreferences.value.hiddenWorkIds)
        assertEquals(123L, opened)
        rule.onNodeWithText("No matching hidden works.").assertExists()
        rule.onNodeWithContentDescription("Back").performClick()
        assertEquals(true, wentBack)
    }
}
