package com.qcksys.ao3tracker.ui.screens.track

import com.qcksys.ao3tracker.data.model.SortField
import com.qcksys.ao3tracker.data.model.SortOrder
import com.qcksys.ao3tracker.data.model.SortState
import com.qcksys.ao3tracker.data.model.Work
import kotlin.test.Test
import kotlin.test.assertEquals

class WorkSortingTest {
    private val missing = Work(id = 3, rowCreatedAt = 30, rowUpdatedAt = 30)
    private val low = work(1, "apple")
    private val high = work(2, "Zebra")
    private val works = listOf(missing, high, low)

    @Test
    fun `ascending nullable fields put known values before missing values`() {
        for (field in nullableFields) {
            assertEquals(
                listOf(1L, 2L, 3L),
                sortWorks(works, SortState(field, SortOrder.ASCENDING)).map { it.id },
                field.name
            )
        }
    }

    @Test
    fun `descending nullable fields put known values before missing values`() {
        for (field in nullableFields) {
            assertEquals(
                listOf(2L, 1L, 3L),
                sortWorks(works, SortState(field, SortOrder.DESCENDING)).map { it.id },
                field.name
            )
        }
    }

    @Test
    fun `default sort shows the most recently read known work first`() {
        assertEquals(listOf(2L, 1L, 3L), sortWorks(works, SortState()).map { it.id })
    }

    @Test
    fun `non-nullable fields still respect direction`() {
        val favourites = listOf(low, high.copy(favourite = true))
        assertEquals(listOf(2L, 1L), sortWorks(favourites, SortState(SortField.FAVOURITE)).map { it.id })
        assertEquals(listOf(1L, 2L), sortWorks(favourites, SortState(SortField.FAVOURITE, SortOrder.ASCENDING)).map { it.id })
        assertEquals(listOf(3L, 2L, 1L), sortWorks(works, SortState(SortField.DATE_ADDED)).map { it.id })
        assertEquals(listOf(1L, 2L, 3L), sortWorks(works, SortState(SortField.DATE_ADDED, SortOrder.ASCENDING)).map { it.id })
    }

    @Test
    fun `equal and missing keys preserve their original order`() {
        val input = listOf(missing, low, missing.copy(id = 4), low.copy(id = 5))
        for (order in SortOrder.entries) {
            assertEquals(listOf(1L, 5L, 3L, 4L), sortWorks(input, SortState(SortField.TITLE, order)).map { it.id })
        }
    }

    private fun work(id: Long, text: String) = Work(
        id = id,
        title = text,
        author = text,
        wordCount = id.toInt(),
        currentChapters = id.toInt(),
        hits = id.toInt(),
        kudos = id.toInt(),
        comments = id.toInt(),
        bookmarks = id.toInt(),
        published = id,
        lastUpdated = id,
        lastRead = id,
        rowCreatedAt = id,
        rowUpdatedAt = id
    )

    private val nullableFields = SortField.entries.filter {
        it != SortField.FAVOURITE && it != SortField.DATE_ADDED
    }
}
