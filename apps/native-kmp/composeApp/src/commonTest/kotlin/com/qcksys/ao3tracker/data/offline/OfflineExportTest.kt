package com.qcksys.ao3tracker.data.offline

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OfflineExportTest {
    @Test
    fun savedChaptersAreReplacedOnlyByKnownNewerRevisions() {
        assertTrue(keepsSavedRevision("2026-02-01T00:00:00Z", "2026-02-01T00:00:00Z"))
        assertTrue(keepsSavedRevision("2026-03-01T00:00:00Z", "2026-02-01T00:00:00Z"))
        assertFalse(keepsSavedRevision("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"))
        assertTrue(keepsSavedRevision(null, null))
        assertTrue(keepsSavedRevision("2026-01-01T00:00:00Z", null))
        assertTrue(keepsSavedRevision("2026-01-01T00:00:00Z", "not a time"))
        assertFalse(keepsSavedRevision(null, "2026-02-01T00:00:00Z"))
    }

    @Test
    fun exportFilesAreNamedByFormatAndWorkCount() {
        assertEquals("ao3tracker-downloads-2026-11-18.zip" to OFFLINE_ARCHIVE_MIME_TYPE,
            offlineExportFile(OfflineExportFormat.Archive, listOf("One"), "2026-11-18"))
        assertEquals("A_B_ C.epub" to OFFLINE_EPUB_MIME_TYPE, offlineExportFile(OfflineExportFormat.Epub, listOf(" A/B: C. "), "2026-11-18"))
        assertEquals("ao3tracker-epubs-2026-11-18.zip" to OFFLINE_ARCHIVE_MIME_TYPE,
            offlineExportFile(OfflineExportFormat.Epub, listOf("One", "Two"), "2026-11-18"))
        assertEquals("Work", offlineFileName("..."))
        assertEquals(80, offlineFileName("x".repeat(200)).length)
    }

    @Test
    fun transferMessagesCountChaptersWorksAndSkippedCopies() {
        assertEquals("Exported 1 chapter from 1 work.", offlineExportMessage(OfflineExportSummary(1, 1, 0)))
        assertEquals("Exported 3 chapters from 2 works. 1 damaged chapter could not be read and was left out.",
            offlineExportMessage(OfflineExportSummary(2, 3, 1)))
        assertTrue(offlineExportMessage(OfflineExportSummary(0, 0, 2)).startsWith("None of the selected chapters"))
        assertEquals("Imported 2 chapters from 1 work.", offlineImportMessage(OfflineImportResult(1, 2, 0, 0)))
        assertEquals("No chapters were imported. Kept 1 chapter already saved at the same or a newer revision. Skipped 2 damaged chapters.",
            offlineImportMessage(OfflineImportResult(0, 0, 1, 2)))
        assertEquals("This export has no saved chapters.", offlineImportMessage(OfflineImportResult(0, 0, 0, 0)))
    }
}
