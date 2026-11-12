package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.offline.OfflineBackup
import com.qcksys.ao3tracker.data.offline.OfflineBackupChapter
import com.qcksys.ao3tracker.data.offline.OfflineBackupStyle
import com.qcksys.ao3tracker.data.offline.OfflineChapter
import com.qcksys.ao3tracker.data.offline.OfflineStyle
import com.qcksys.ao3tracker.data.offline.offlineBackupPages
import com.qcksys.ao3tracker.data.offline.offlineLocation
import com.qcksys.ao3tracker.data.offline.renderOfflineDocument
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OfflineBackupPagesTest {
    private fun page(text: String) =
        "<html lang=\"en\"><head><meta charset=\"utf-8\"><title>Cats</title></head><body><div id=\"chapters\"><p>$text</p></div></body></html>"

    private val backup = OfflineBackup(
        workId = 42,
        title = "Cats",
        ao3UpdatedAt = "2026-10-01T12:00:00.000Z",
        skins = listOf(
            OfflineBackupStyle("body { color: black; }", "screen", "https://archiveofourown.org/stylesheets/site/2.0/01-core.css"),
            OfflineBackupStyle("body { color: white; }", "screen and (prefers-color-scheme: dark)",
                "https://archiveofourown.org/stylesheets/masters/reversi/reversi_site_screen_.css")
        ),
        chapters = listOf(
            OfflineBackupChapter("101", 1, "Start", page("One"), listOf("https://example.com/a.png")),
            OfflineBackupChapter("102", 2, "", page("Two"), emptyList())
        )
    )

    @Test
    fun `each chapter page is saved for its AO3 chapter URL with AO3's default skins`() {
        val pages = offlineBackupPages(backup, "user:reader")
        val manifest = listOf(
            OfflineChapter("101", 1, "Start", "https://archiveofourown.org/works/42/chapters/101"),
            OfflineChapter("102", 2, "", "https://archiveofourown.org/works/42/chapters/102")
        )
        assertEquals(manifest.map { it.url }, pages.map { it.url })
        assertEquals(listOf(page("One"), page("Two")), pages.map { it.html })
        pages.forEach { page ->
            assertEquals("42", page.workId)
            assertEquals("chapter", page.representation)
            assertEquals("user:reader", page.ao3Identity)
            assertFalse(page.canSelectSkin)
            assertEquals(manifest, page.chapters)
            assertEquals("2026-10-01T12:00:00.000Z", page.downloadUpdatedAt)
            assertEquals(listOf(
                OfflineStyle("body { color: black; }", "https://archiveofourown.org/stylesheets/site/2.0/01-core.css", "screen", false),
                OfflineStyle("body { color: white; }", "https://archiveofourown.org/stylesheets/masters/reversi/reversi_site_screen_.css",
                    "screen and (prefers-color-scheme: dark)", false)
            ), page.siteStyles)
            assertEquals(page.chapterId, offlineLocation(page.url).chapterId)
        }
    }

    @Test
    fun `the reader renders the skins with their media conditions`() {
        val rendered = offlineBackupPages(backup, "guest").first().let { renderOfflineDocument(it.html, it.siteStyles) }
        assertTrue("<style media=\"screen\">body { color: black; }</style>" in rendered)
        assertTrue("<style media=\"screen and (prefers-color-scheme: dark)\">body { color: white; }</style>" in rendered)
    }

    @Test
    fun `an unindexed single chapter is saved at the work URL as chapter zero`() {
        val single = backup.copy(chapters = listOf(OfflineBackupChapter("0", 1, "", page("Only"), emptyList())))
        val page = offlineBackupPages(single, "guest").single()
        assertEquals("https://archiveofourown.org/works/42", page.url)
        assertEquals("0", page.chapterId)
    }

    @Test
    fun `a chapter without a document head is rejected before it is saved`() {
        val broken = backup.copy(chapters = listOf(OfflineBackupChapter("101", 1, "", "<p>Text</p>", emptyList())))
        assertFailsWith<IllegalArgumentException> { offlineBackupPages(broken, "guest") }
    }
}
