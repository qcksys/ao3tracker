package com.qcksys.ao3tracker.ui.screens.track

import com.qcksys.ao3tracker.data.model.Chapter
import com.qcksys.ao3tracker.data.model.Work
import kotlin.test.Test
import kotlin.test.assertEquals

class ChapterProgressBarTest {
    @Test
    fun `missing and unread middle chapters retain their positions`() {
        val work = work(current = 5, chapters = listOf(
            chapter(5, 0.5f), chapter(1, 1f), chapter(3, 0f), chapter(4, 1f)
        ))
        assertEquals(listOf(1f, 0f, 0f, 1f, 0.5f), work.chapterProgressSegments())
    }

    @Test
    fun `known planned chapters remain empty at the end`() {
        val work = work(current = 2, total = 4, chapters = listOf(chapter(1, 1f), chapter(2, 0.4f)))
        assertEquals(listOf(1f, 0.4f, 0f, 0f), work.chapterProgressSegments())
    }

    @Test
    fun `chapter numbers preserve gaps without work counts and with stale counts`() {
        val work = work(chapters = listOf(chapter(4, 1f)))
        assertEquals(listOf(0f, 0f, 0f, 1f), work.chapterProgressSegments())
        assertEquals(listOf(0f, 0f, 0f, 1f), work.copy(currentChapters = 2, totalChapters = 3).chapterProgressSegments())
    }

    @Test
    fun `completed chapters fill their segments and partial chapters retain progress`() {
        val work = work(current = 4, chapters = listOf(
            chapter(1, 0.2f).copy(markedCompleteAt = 1), chapter(2, 0.96f), chapter(3, 0.5f), chapter(4, null)
        ))
        assertEquals(listOf(1f, 1f, 0.5f, 0f), work.chapterProgressSegments())
    }

    @Test
    fun `deleted chapter progress is not shown or used to extend the bar`() {
        val work = work(current = 3, chapters = listOf(
            chapter(1, 1f), chapter(2, 1f).copy(rowDeletedAt = 1), chapter(9, 1f).copy(rowDeletedAt = 1)
        ))
        assertEquals(listOf(1f, 0f, 0f), work.chapterProgressSegments())
    }

    @Test
    fun `a single chapter without a number uses the only segment`() {
        assertEquals(listOf(0.5f), work(chapters = listOf(chapter(null, 0.5f))).chapterProgressSegments())
    }

    @Test
    fun `unknown chapter numbers do not invent reading positions in multi chapter works`() {
        val work = work(current = 3, chapters = listOf(chapter(null, 1f), chapter(3, 0.5f)))
        assertEquals(listOf(0f, 0f, 0.5f), work.chapterProgressSegments())
        assertEquals(listOf(0f, 0f), work(chapters = listOf(chapter(null, 1f), chapter(null, 0.5f))).chapterProgressSegments())
    }

    @Test
    fun `empty works have no segments unless their chapter count is known`() {
        assertEquals(emptyList(), work().chapterProgressSegments())
        assertEquals(listOf(0f, 0f), work(current = 2).chapterProgressSegments())
    }

    @Test
    fun `progress outside the display range is clamped`() {
        val work = work(current = 2, chapters = listOf(chapter(1, -0.5f), chapter(2, 1.2f)))
        assertEquals(listOf(0f, 1f), work.chapterProgressSegments())
    }

    private fun work(current: Int? = null, total: Int? = null, chapters: List<Chapter> = emptyList()) = Work(
        id = 1, currentChapters = current, totalChapters = total, chapterList = chapters,
        rowCreatedAt = 0, rowUpdatedAt = 0
    )

    private fun chapter(number: Int?, progress: Float?) = Chapter(
        id = number?.toLong() ?: 0, workId = 1, number = number, readProgress = progress,
        rowCreatedAt = 0, rowUpdatedAt = 0
    )
}
