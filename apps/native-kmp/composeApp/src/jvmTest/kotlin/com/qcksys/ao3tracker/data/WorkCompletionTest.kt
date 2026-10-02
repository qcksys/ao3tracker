package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.ChapterEntity
import com.qcksys.ao3tracker.data.database.WorkEntity
import com.qcksys.ao3tracker.data.model.FilterState
import com.qcksys.ao3tracker.data.model.ReadingStatus
import com.qcksys.ao3tracker.data.model.ScrollProgressEvent
import com.qcksys.ao3tracker.data.model.TagFilterMode
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import java.nio.file.Files
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WorkCompletionTest {
    @Test
    fun `scrolling through available chapters makes later updates discoverable`() = runTest {
        fixture { accounts, repository ->
            repository.updateScrollProgress(scroll(11, 95))
            assertNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            repository.updateScrollProgress(scroll(12, 94))
            assertNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            repository.updateScrollProgress(scroll(12, 95))
            assertLaterUpdate(accounts, repository)
        }
    }

    @Test
    fun `marking the last available chapter read makes later updates discoverable`() = runTest {
        fixture { accounts, repository ->
            repository.markChapterAsRead(11, 1)
            assertNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            repository.markChapterAsRead(12, 1)
            assertLaterUpdate(accounts, repository)
        }
    }

    @Test
    fun `marking the work read makes later updates discoverable`() = runTest {
        fixture { accounts, repository ->
            repository.markWorkAsRead(1)
            assertLaterUpdate(accounts, repository)
        }
    }

    @Test
    fun `marking locally known chapters read does not complete missing chapters`() = runTest {
        fixture { accounts, repository ->
            accounts.edit {
                val work = assertNotNull(accounts.database.workDao().getWorkById(1))
                accounts.database.workDao().upsertWork(work.copy(currentChapters = 3))
            }
            repository.markWorkAsRead(1)
            assertNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            assertTrue(repository.getFilteredWorks(newChapterFilter).first().isEmpty())
        }
    }

    @Test
    fun `empty works and deleted chapters cannot count as caught up`() = runTest {
        fixture { accounts, repository ->
            accounts.edit { accounts.database.chapterDao().softDeleteChapter(12, 1, 200, 200) }
            repository.markWorkAsRead(1)
            assertNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            accounts.edit {
                accounts.database.workDao().upsertWork(WorkEntity(2, currentChapters = 0, rowCreatedAt = 100, rowUpdatedAt = 100))
            }
            repository.markWorkAsRead(2)
            assertNull(accounts.database.workDao().getWorkById(2)?.markedCompleteAt)
        }
    }

    @Test
    fun `marking a chapter unread clears completion until caught up again`() = runTest {
        fixture { accounts, repository ->
            repository.markWorkAsRead(1)
            assertNotNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            repository.markChapterAsUnread(11, 1)
            assertNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            repository.markChapterAsRead(11, 1)
            assertNotNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            repository.markWorkAsUnread(1)
            assertNull(accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
            assertTrue(repository.getFilteredWorks(newChapterFilter).first().isEmpty())
        }
    }

    @Test
    fun `revisiting an already read work records its missing completion marker`() = runTest {
        fixture { accounts, repository ->
            accounts.edit { accounts.database.chapterDao().markAllChaptersAsRead(1, 100, 100, 100) }
            repository.updateScrollProgress(scroll(12, 10))
            assertLaterUpdate(accounts, repository)
        }
    }

    private suspend fun assertLaterUpdate(accounts: AccountDataStore, repository: Ao3Repository) {
        val work = assertNotNull(accounts.database.workDao().getWorkById(1))
        val completedAt = assertNotNull(work.markedCompleteAt)
        assertEquals(work.lastRead, completedAt)
        assertEquals(work.rowUpdatedAt, completedAt)
        assertTrue(repository.getFilteredWorks(newChapterFilter).first().isEmpty())
        assertEquals("caught-up", repository.getWorkBadges(listOf(1)).single().status)

        accounts.edit { accounts.database.workDao().upsertWork(work.copy(currentChapters = 3)) }
        assertEquals(listOf(1L), repository.getFilteredWorks(newChapterFilter).first().map { it.id })
        assertEquals("has-new-chapters", repository.getWorkBadges(listOf(1)).single().status)

        accounts.edit { accounts.database.chapterDao().upsertChapter(chapter(13)) }
        repository.updateScrollProgress(scroll(13, 25))
        assertEquals(completedAt, accounts.database.workDao().getWorkById(1)?.markedCompleteAt)
        assertEquals(listOf(1L), repository.getFilteredWorks(newChapterFilter).first().map { it.id })
        repository.markChapterAsRead(13, 1)
        assertTrue(repository.getFilteredWorks(newChapterFilter).first().isEmpty())
        assertEquals("caught-up", repository.getWorkBadges(listOf(1)).single().status)
    }

    private suspend fun fixture(block: suspend (AccountDataStore, Ao3Repository) -> Unit) {
        val directory = Files.createTempDirectory("ao3tracker-completion-")
        val accounts = createTestAccounts(directory)
        try {
            accounts.initialize()
            accounts.edit {
                accounts.database.workDao().upsertWork(WorkEntity(1, currentChapters = 2, rowCreatedAt = 100, rowUpdatedAt = 100))
                accounts.database.chapterDao().upsertChapters(listOf(chapter(11), chapter(12)))
            }
            block(accounts, Ao3Repository(accounts))
        } finally {
            accounts.close()
            Files.walk(directory).use { files -> files.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private fun chapter(id: Long) = ChapterEntity(1, chapterId = id, rowCreatedAt = 100, rowUpdatedAt = 100)
    private fun scroll(chapterId: Long, percent: Int) = ScrollProgressEvent(
        url = "https://archiveofourown.org/works/1/chapters/$chapterId",
        scrollPercentage = percent
    )
    private val newChapterFilter = FilterState(readingStatusFilters = mapOf(ReadingStatus.HAS_NEW_CHAPTERS to TagFilterMode.INCLUDE))
}
