package com.qcksys.ao3tracker.ui.screens.track

import com.qcksys.ao3tracker.data.model.SortField
import com.qcksys.ao3tracker.data.model.SortOrder
import com.qcksys.ao3tracker.data.model.SortState
import com.qcksys.ao3tracker.data.model.Work

internal fun sortWorks(works: List<Work>, sortState: SortState): List<Work> {
    fun <T : Comparable<T>> byField(selector: (Work) -> T?): Comparator<Work> {
        val valueOrder = if (sortState.order == SortOrder.DESCENDING) reverseOrder<T>() else naturalOrder<T>()
        return compareBy(nullsLast(valueOrder), selector)
    }

    val comparator: Comparator<Work> = when (sortState.field) {
        SortField.LAST_READ -> byField { it.lastRead }
        SortField.FAVOURITE -> byField { it.favourite }
        SortField.TITLE -> byField { it.title?.lowercase() }
        SortField.AUTHOR -> byField { it.author?.lowercase() }
        SortField.WORD_COUNT -> byField { it.wordCount }
        SortField.CHAPTERS -> byField { it.currentChapters }
        SortField.HITS -> byField { it.hits }
        SortField.KUDOS -> byField { it.kudos }
        SortField.COMMENTS -> byField { it.comments }
        SortField.BOOKMARKS -> byField { it.bookmarks }
        SortField.PUBLISHED -> byField { it.published }
        SortField.UPDATED -> byField { it.lastUpdated }
        SortField.DATE_ADDED -> byField { it.rowCreatedAt }
    }

    return works.sortedWith(comparator)
}
