package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.qcksys.ao3tracker.data.settings.AppSettings
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test

class OfflineSettingsTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun independentAccordionValidatesCustomCountAndAllAndRetainsChoices() {
        val settings = AppSettings(null)
        rule.setContent {
            MaterialTheme {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    OfflineStorageSettingsContent(settings, 0, 0, {}, {})
                }
            }
        }
        rule.onNodeWithText("Chapters to prefetch").assertDoesNotExist()
        rule.onNodeWithText("Offline reading").performClick()
        rule.onNodeWithText("Chapters to prefetch").performTextReplacement("-1")
        rule.onNodeWithText("Save prefetch count").assertIsNotEnabled()
        rule.onNodeWithText("Chapters to prefetch").performTextReplacement("1.5")
        rule.onNodeWithText("Save prefetch count").assertIsNotEnabled()
        rule.onNodeWithText("Chapters to prefetch").performTextReplacement("17")
        rule.onNodeWithText("Save prefetch count").performScrollTo().performClick()
        assertEquals(17, settings.offlinePreferences.value.prefetchChapters)
        rule.onNodeWithContentDescription("Prefetch all upcoming chapters").performScrollTo().performClick()
        assertEquals(null, settings.offlinePreferences.value.prefetchChapters)
        rule.onNodeWithContentDescription("Delete automatic saves after reading").performScrollTo().performClick()
        assertTrue(settings.offlinePreferences.value.autoDeleteRead)
        rule.onNodeWithText("Offline reading").performScrollTo().performClick()
        rule.onNodeWithText("Offline reading").performClick()
        assertEquals(null, settings.offlinePreferences.value.prefetchChapters)
        rule.onNodeWithContentDescription("Prefetch all upcoming chapters").performScrollTo().performClick()
        rule.onNodeWithText("Chapters to prefetch").performTextReplacement("0")
        rule.onNodeWithText("Save prefetch count").performScrollTo().performClick()
        assertEquals(0, settings.offlinePreferences.value.prefetchChapters)
    }
}
