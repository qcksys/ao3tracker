package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.qcksys.ao3tracker.data.database.OfflineWorkEntity
import com.qcksys.ao3tracker.data.offline.OfflineChapter
import com.qcksys.ao3tracker.data.offline.OfflineExportFormat
import com.qcksys.ao3tracker.data.offline.OfflineTransferStatus
import com.qcksys.ao3tracker.data.offline.OfflineWorkStatus
import com.qcksys.ao3tracker.ui.screens.settings.OfflineTransferSettingsContent
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test

class OfflineExportContentTest {
    @get:Rule
    val rule = createComposeRule()

    private fun work(id: Long, title: String) = OfflineWorkStatus(OfflineWorkEntity("context", id, title, "[]", true, 1),
        listOf(OfflineChapter("$id", 1, "One", "https://archiveofourown.org/works/$id/chapters/$id")), setOf("$id"), null, 0)

    @Test
    fun readersChooseTheWorksAndFormatToExport() {
        val works = listOf(work(1, "First"), work(2, "Second"))
        var selected by mutableStateOf(setOf(1L))
        var format by mutableStateOf(OfflineExportFormat.Archive)
        var exports = 0
        rule.setContent {
            MaterialTheme {
                OfflineExportContent(works, selected, format, OfflineTransferStatus(),
                    onToggle = { selected = if (it in selected) selected - it else selected + it },
                    onSelectAll = { selected = works.map { it.work.workId }.toSet() },
                    onClear = { selected = emptySet() },
                    onFormat = { format = it },
                    onExport = { exports++ })
            }
        }

        rule.onNodeWithText("Works · 1 of 2 selected").assertExists()
        rule.onNodeWithText("App archive").assertIsSelected()
        rule.onNodeWithText("Second").performClick()
        assertEquals(setOf(1L, 2L), selected)
        rule.onNodeWithText("Select all").assertIsNotEnabled()
        rule.onNodeWithText("EPUB").performClick()
        assertEquals(OfflineExportFormat.Epub, format)
        rule.onNodeWithText("Export 2 works").performClick()
        assertEquals(1, exports)
        rule.onNodeWithText("Clear").performClick()
        rule.onNodeWithText("Choose works to export").assertIsNotEnabled()
    }

    @Test
    fun exportWaitsForTheCurrentTransfer() {
        rule.setContent {
            MaterialTheme {
                OfflineExportContent(listOf(work(1, "First")), setOf(1L), OfflineExportFormat.Archive,
                    OfflineTransferStatus(progress = "Importing…"), {}, {}, {}, {}, {})
            }
        }
        rule.onNodeWithText("Importing…").assertIsNotEnabled()
    }

    @Test
    fun settingsOfferExportOnlyWithSavedWorksAndShowTheLatestResult() {
        var savedWorks by mutableStateOf(0)
        var imports = 0
        rule.setContent {
            MaterialTheme {
                OfflineTransferSettingsContent(savedWorks, OfflineTransferStatus(message = "Imported 2 chapters from 1 work."),
                    onExport = {}, onImport = { imports++ })
            }
        }

        rule.onNodeWithText("Export & import").performClick()
        rule.onNodeWithText("Export downloaded works").assertIsNotEnabled()
        rule.onNodeWithText("Import downloaded works").performClick()
        assertEquals(1, imports)
        rule.onNodeWithText("Imported 2 chapters from 1 work.").assertExists()
        savedWorks = 1
        rule.onNodeWithText("1 saved work · Downloaded works").assertExists()
    }
}
