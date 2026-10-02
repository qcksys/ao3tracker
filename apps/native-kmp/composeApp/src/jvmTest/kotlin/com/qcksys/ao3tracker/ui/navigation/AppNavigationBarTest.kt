package com.qcksys.ao3tracker.ui.navigation

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cafe.adriel.voyager.navigator.tab.TabNavigator
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class AppNavigationBarTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun searchesHasItsOwnTabAlongsideWorks() {
        lateinit var navigator: TabNavigator
        rule.setContent {
            MaterialTheme {
                TabNavigator(TrackTab) {
                    navigator = it
                    AppNavigationBar(isWebViewLoading = false)
                }
            }
        }

        rule.onNodeWithText("Read").assertIsDisplayed()
        rule.onNodeWithText("Works").assertIsSelected()
        rule.onNodeWithText("Settings").assertIsDisplayed()
        rule.onNodeWithText("Track").assertDoesNotExist()

        rule.onNodeWithText("Searches").performClick().assertIsSelected()
        rule.onNodeWithText("Works").assertIsNotSelected()
        rule.runOnIdle { assertEquals(SearchesTab, navigator.current) }

        rule.onNodeWithText("Works").performClick().assertIsSelected()
        rule.runOnIdle { assertEquals(TrackTab, navigator.current) }
    }
}
