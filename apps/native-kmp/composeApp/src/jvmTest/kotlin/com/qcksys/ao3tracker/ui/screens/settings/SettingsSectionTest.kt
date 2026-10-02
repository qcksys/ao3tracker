package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

class SettingsSectionTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun sectionsExposeTheirStateAndExpandIndependently() {
        rule.setContent {
            MaterialTheme {
                Column {
                    SettingsSection("Notifications", "On this device", Icons.Default.Notifications) {
                        Text("New chapters")
                    }
                    SettingsSection("Advanced", "Developer options", Icons.Default.Notifications) {
                        Text("API Environment")
                    }
                }
            }
        }

        rule.onNodeWithText("Notifications")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Collapsed"))
        rule.onNodeWithText("New chapters").assertDoesNotExist()
        rule.onNodeWithText("API Environment").assertDoesNotExist()

        rule.onNodeWithText("Notifications").performClick()
        rule.onNodeWithText("Notifications")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Expanded"))
        rule.onNodeWithText("New chapters").assertIsDisplayed()
        rule.onNodeWithText("Advanced").performClick()
        rule.onNodeWithText("New chapters").assertIsDisplayed()
        rule.onNodeWithText("API Environment").assertIsDisplayed()

        rule.onNodeWithText("Notifications").performClick()
        rule.onNodeWithText("New chapters").assertDoesNotExist()
        rule.onNodeWithText("API Environment").assertIsDisplayed()
    }
}
