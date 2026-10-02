package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.qcksys.ao3tracker.data.settings.ApiEnvironment
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class DeveloperSectionTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun productionHidesServerSelectionEvenWithDevModeEnabled() {
        render(canSelectApiEnvironment = false)
        rule.onNodeWithText("Advanced").performClick()
        rule.onNodeWithText("API Environment").assertDoesNotExist()
        rule.onNodeWithText("Production").assertDoesNotExist()
        rule.onNodeWithText("Error Reporting").assertExists()
    }

    @Test
    fun developmentCanSelectServer() {
        var selected: ApiEnvironment? = null
        render(canSelectApiEnvironment = true, onEnvironmentChanged = { selected = it })
        rule.onNodeWithText("Advanced").performClick()
        rule.onNodeWithText("Production").performClick()
        rule.onNodeWithText("Development").performClick()
        assertEquals(ApiEnvironment.DEV, selected)
    }

    private fun render(canSelectApiEnvironment: Boolean, onEnvironmentChanged: (ApiEnvironment) -> Unit = {}) {
        rule.setContent {
            MaterialTheme {
                DeveloperSection(
                    devModeEnabled = true,
                    onDevModeChanged = {},
                    apiEnvironment = ApiEnvironment.PRODUCTION,
                    canSelectApiEnvironment = canSelectApiEnvironment,
                    onApiEnvironmentChanged = onEnvironmentChanged
                )
            }
        }
    }
}
