package com.qcksys.ao3tracker.ui.navigation

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cafe.adriel.voyager.navigator.tab.TabNavigator
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
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

    @Test
    fun firstTapReturnsToATabAndSecondTapResetsIt() {
        val works = object : TabNavigatorContract {
            var depth = 2
            override val isAtRoot get() = depth == 1
            override fun popToRoot() { depth = 1 }
        }
        var worksScrolls = 0
        lateinit var navigator: TabNavigator
        try {
            NavigationState.registerTrackTabNavigator(works)
            rule.setContent {
                LaunchedEffect(Unit) { NavigationState.worksScrollToTop.collect { worksScrolls++ } }
                MaterialTheme {
                    TabNavigator(TrackTab) {
                        navigator = it
                        AppNavigationBar(isWebViewLoading = false)
                    }
                }
            }

            rule.onNodeWithText("Read").performClick().assertIsSelected()
            rule.runOnIdle { assertFalse(NavigationState.navigateReadToHome.value) }
            rule.onNodeWithText("Read").performClick()
            rule.runOnIdle { assertTrue(NavigationState.navigateReadToHome.value) }
            NavigationState.clearReadTabHome()

            rule.onNodeWithText("Works").performClick().assertIsSelected()
            rule.runOnIdle {
                assertEquals(TrackTab, navigator.current)
                assertEquals(2, works.depth)
                assertEquals(0, worksScrolls)
            }
            rule.onNodeWithText("Works").performClick()
            rule.runOnIdle { assertEquals(1, works.depth); assertEquals(0, worksScrolls) }
            rule.onNodeWithText("Works").performClick()
            rule.runOnIdle { assertEquals(1, worksScrolls) }
        } finally {
            NavigationState.clearAll()
        }
    }
}
