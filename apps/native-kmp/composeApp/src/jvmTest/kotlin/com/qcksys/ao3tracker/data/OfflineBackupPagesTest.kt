package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.offline.OfflineBackup
import com.qcksys.ao3tracker.data.offline.OfflineBackupChapter
import com.qcksys.ao3tracker.data.offline.OfflineChapter
import com.qcksys.ao3tracker.data.offline.OfflineStyle
import com.qcksys.ao3tracker.data.offline.offlineBackupPages
import com.qcksys.ao3tracker.data.offline.offlineLocation
import com.qcksys.ao3tracker.data.offline.renderOfflineDocument
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OfflineBackupPagesTest {
    private val backup = OfflineBackup(
        workId = 42,
        title = "Cats & <Dogs>",
        ao3UpdatedAt = "2026-10-01T12:00:00.000Z",
        styles = "#chapters { font-family: serif; }",
        preface = "<div class=\"meta\"><h1>Cats</h1></div>",
        afterword = "<div class=\"meta\"><div id=\"endnotes\">Thanks</div></div>",
        chapters = listOf(
            OfflineBackupChapter("101", 1, "Start", "<div class=\"userstuff\"><p>One</p></div>", listOf("https://example.com/a.png")),
            OfflineBackupChapter("102", 2, "", "<div class=\"userstuff\"><p>Two</p></div>", emptyList())
        )
    )

    @Test
    fun `each chapter becomes a saved chapter page for its AO3 chapter URL`() {
        val pages = offlineBackupPages(backup, "user:reader")
        val manifest = listOf(
            OfflineChapter("101", 1, "Start", "https://archiveofourown.org/works/42/chapters/101"),
            OfflineChapter("102", 2, "", "https://archiveofourown.org/works/42/chapters/102")
        )
        assertEquals(manifest.map { it.url }, pages.map { it.url })
        pages.forEach { page ->
            assertEquals("42", page.workId)
            assertEquals("chapter", page.representation)
            assertEquals("user:reader", page.ao3Identity)
            assertFalse(page.canSelectSkin)
            assertEquals(manifest, page.chapters)
            assertEquals("2026-10-01T12:00:00.000Z", page.downloadUpdatedAt)
            assertEquals(listOf(OfflineStyle(backup.styles, "https://archiveofourown.org/works/42", "all", false)), page.siteStyles)
            assertEquals(page.chapterId, offlineLocation(page.url).chapterId)
        }
    }

    @Test
    fun `pages keep AO3's chapter structure with the preface first and end notes last`() {
        val (first, second) = offlineBackupPages(backup, "guest").map { renderOfflineDocument(it.html, it.siteStyles) }
        assertTrue("<title>Cats &amp; &lt;Dogs&gt;</title>" in first)
        assertTrue("<div id=\"chapters\" role=\"article\"><div class=\"chapter\" id=\"chapter-1\"><div class=\"userstuff\"><p>One</p>" in first)
        assertTrue("<h1>Cats</h1>" in first)
        assertFalse("endnotes" in first)
        assertTrue("<h2 class=\"title heading\">Cats &amp; &lt;Dogs&gt;</h2>" in second)
        assertTrue("<div id=\"endnotes\">Thanks</div>" in second)
        assertTrue("font-family: serif" in second)
    }

    @Test
    fun `an unindexed single chapter is saved at the work URL as chapter zero`() {
        val single = backup.copy(chapters = listOf(OfflineBackupChapter("0", 1, "", "<div class=\"userstuff\"><p>Only</p></div>", emptyList())), styles = "")
        val page = offlineBackupPages(single, "guest").single()
        assertEquals("https://archiveofourown.org/works/42", page.url)
        assertEquals("0", page.chapterId)
        assertEquals(emptyList(), page.siteStyles)
        assertTrue("<h1>Cats</h1>" in page.html && "Thanks" in page.html)
    }
}
