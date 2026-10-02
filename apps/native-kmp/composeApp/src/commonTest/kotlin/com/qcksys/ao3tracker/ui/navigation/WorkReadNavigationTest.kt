package com.qcksys.ao3tracker.ui.navigation

import com.qcksys.ao3tracker.data.model.Chapter
import com.qcksys.ao3tracker.data.model.Work
import kotlin.test.Test
import kotlin.test.assertEquals

class WorkReadNavigationTest {
    @Test
    fun `finished chapter opens the immediate next chapter at the start`() {
        for (current in listOf(chapter(91, 1, 0.95f, 100), chapter(91, 1, 0.4f, 100).copy(markedCompleteAt = 100))) {
            val work = work(chapter(80, 3), current, chapter(42, 2, 0.6f, 50))
            assertEquals(ReadNavigation("https://archiveofourown.org/works/1/chapters/42", 0f), work.readNavigation())
        }
    }

    @Test
    fun `unfinished chapter retains its saved position`() {
        val work = work(chapter(91, 1, 0.94f, 100), chapter(42, 2))
        assertEquals(ReadNavigation("https://archiveofourown.org/works/1/chapters/91", 0.94f), work.readNavigation())
    }

    @Test
    fun `finished final chapter retains its saved position`() {
        val work = work(chapter(91, 1), chapter(42, 2, 1f, 100))
        assertEquals(ReadNavigation("https://archiveofourown.org/works/1/chapters/42", 1f), work.readNavigation())
    }

    @Test
    fun `deleted or missing next chapter is not opened and later chapters are not skipped to`() {
        val current = chapter(91, 1, 1f, 100)
        for (chapters in listOf(
            listOf(current, chapter(42, 2).copy(rowDeletedAt = 200), chapter(80, 3)),
            listOf(current, chapter(80, 3)),
            listOf(current.copy(number = null), chapter(42, 2))
        )) {
            assertEquals(ReadNavigation("https://archiveofourown.org/works/1/chapters/91", 1f), work(*chapters.toTypedArray()).readNavigation())
        }
    }

    @Test
    fun `unread work and chapter zero use the work URL`() {
        assertEquals(ReadNavigation("https://archiveofourown.org/works/1", 0f), work().readNavigation())
        assertEquals(ReadNavigation("https://archiveofourown.org/works/1", 0.4f), work(chapter(0, 1, 0.4f, 100)).readNavigation())
    }

    private fun work(vararg chapters: Chapter) = Work(id = 1, rowCreatedAt = 0, rowUpdatedAt = 0, chapterList = chapters.toList())

    private fun chapter(id: Long, number: Int, progress: Float = 0f, lastReadAt: Long? = null) = Chapter(
        id = id, workId = 1, number = number, readProgress = progress, lastReadAt = lastReadAt,
        rowCreatedAt = 0, rowUpdatedAt = 0
    )
}
