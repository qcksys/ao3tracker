package com.qcksys.ao3tracker.ui.screens.searches

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import com.qcksys.ao3tracker.data.database.SearchCheckEntity
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class SearchesCheckUiTest {
    @get:Rule val rule = createComposeRule()
    private val search = SavedSearchEntity("search", "Stories", "https://archiveofourown.org/works", false, 1, false)

    @Test
    fun fullScanRequiresAnExplicitActionAndExplainsItsCost() {
        val scans = mutableListOf<String>()
        rule.setContent {
            MaterialTheme {
                SearchesScreenContent(listOf(search), {}, { _, _ -> }, {}, onFullScan = { scans.add(it) })
            }
        }
        rule.onNodeWithText("Full scan").performClick()
        rule.onNodeWithText("Reads every results page", substring = true).assertIsDisplayed()
        assertEquals(emptyList(), scans)
        rule.onNodeWithText("Cancel").performClick()
        assertEquals(emptyList(), scans)
        rule.onNodeWithText("Full scan").performClick()
        rule.onNodeWithText("Start full scan").performClick()
        assertEquals(listOf(search.id), scans)
    }

    @Test
    fun partialResultsAndRateLimitStatusRemainVisibleAlongsideCounts() {
        val snapshot = SearchCheckEntity(search.id, search.url, "query", "[]", 1000, 500, 3, 2, partial = true)
        rule.setContent {
            MaterialTheme {
                SearchesScreenContent(listOf(search), {}, { _, _ -> }, {}, checks = mapOf(search.id to snapshot), checkStatus = "AO3 checks are paused.")
            }
        }
        rule.onNodeWithText("3 newly found · 2 updated works").assertIsDisplayed()
        rule.onNodeWithText("Partial results", substring = true).assertIsDisplayed()
        rule.onNodeWithText("AO3 checks are paused.").assertIsDisplayed()
    }
}
