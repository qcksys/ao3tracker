package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.database.OfflineChapterEntity
import com.qcksys.ao3tracker.data.database.OfflineJobEntity
import com.qcksys.ao3tracker.data.database.OfflineWorkEntity
import com.qcksys.ao3tracker.data.offline.*
import kotlin.test.*

class OfflineDownloadStatusTest {
    @Test
    fun `summary reports active queue states before saved works`() {
        assertEquals("None saved", offlineDownloadsSummary(emptyList()))
        assertEquals("2 saved", offlineDownloadsSummary(listOf(status(1, saved = true), status(2, saved = true), status(3))))
        assertEquals("Downloading · 1 queued · 1 paused",
            offlineDownloadsSummary(listOf(status(1, "running"), status(2, "queued"), status(3, "failed"), status(4, "complete", saved = true))))
    }

    @Test
    fun `queue lists unfinished jobs with the running download first`() {
        val queue = offlineDownloadQueue(listOf(status(1, "failed"), status(2, "complete"), status(3, "queued"), status(4), status(5, "running")))
        assertEquals(listOf(5L, 3L, 1L), queue.map { it.work.workId })
    }

    @Test
    fun `notification describes the chapter in progress instead of saved coverage`() {
        val updating = status(1, "running", saved = true)
        assertEquals(OfflineDownloadNotification("Updating Work 1", "Finding chapters"),
            offlineDownloadNotification(request("update-discover", 0, 1), updating))
        assertEquals(OfflineDownloadNotification("Updating Work 1", "Updating chapter 2 of 3"),
            offlineDownloadNotification(request("update", 1, 3), updating))
        assertEquals(OfflineDownloadNotification("Saving Work 1", "Saving chapter 1 of 4"),
            offlineDownloadNotification(request("save", 0, 4), status(1, "running")))
        assertEquals("Saving upcoming chapters of Work 1",
            offlineDownloadNotification(request("prefetch", 0, 2, automatic = true), status(1, "running")).title)
        assertEquals("Waiting to download chapters", offlineDownloadNotification(null, null).text)
    }

    @Test
    fun `background updates target idle explicit downloads with new chapters or newer revisions`() {
        assertTrue(needsBackgroundUpdate(status(1, "complete", saved = true, published = 3), null))
        assertFalse(needsBackgroundUpdate(status(1, "queued", saved = true, published = 3), null))
        assertFalse(needsBackgroundUpdate(status(1, saved = true, published = 3, pinned = false), null))
        val current = status(1, saved = true, revision = "2026-01-01T00:00:00Z")
        assertFalse(needsBackgroundUpdate(current, "2026-01-01T00:00:00Z"))
        assertTrue(needsBackgroundUpdate(current, "2026-02-01T00:00:00Z"))
        assertFalse(needsBackgroundUpdate(status(1, saved = true), "2026-02-01T00:00:00Z"))
    }

    private fun status(workId: Long, state: String? = null, saved: Boolean = false, published: Int = 1,
        pinned: Boolean = true, revision: String? = null): OfflineWorkStatus {
        val chapter = OfflineChapter("10", 1, "Chapter 1", "https://archiveofourown.org/works/$workId/chapters/10")
        val snapshot = OfflineChapterEntity("context", "key-$workId", workId, 10, chapter.url, "chapter", "file", "skin", "[]",
            1, 1, 1, revision)
        return OfflineWorkStatus(OfflineWorkEntity("context", workId, "Work $workId", "[]", pinned, 1), listOf(chapter),
            if (saved) setOf("10") else emptySet(),
            state?.let { OfflineJobEntity("job-$workId", "context", workId, "save", "[]", "[]", it, 0, 0, null, 1) },
            0, published, if (saved) listOf(snapshot) else emptyList())
    }

    private fun request(mode: String, done: Int, total: Int, automatic: Boolean = false): OfflineDownloadRequest {
        val capture = OfflineCaptureRequest("https://archiveofourown.org/works/1/chapters/10", "user", { true }, { _, _ -> error("unused") },
            publish = {}, onFailure = { _, _ -> }, onProgress = {})
        return OfflineDownloadRequest("id", 1, capture.url, capture, automatic, mode, done, total)
    }
}
