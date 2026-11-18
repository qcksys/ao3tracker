package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.foundation.lazy.LazyListState

/**
 * Saved Works list scroll position. It is anchored to the first visible work because reading a work
 * can move it to the top of the list before the reader returns.
 */
internal data class WorksListPosition(val workId: Long?, val index: Int, val offset: Int) {
    fun restoreIn(workIds: List<Long>): WorksListPosition {
        if (workIds.isEmpty()) return Top
        val anchored = workId?.let(workIds::indexOf)?.takeIf { it >= 0 }
        return if (anchored != null) WorksListPosition(workId, anchored, offset)
        else WorksListPosition(null, index.coerceAtMost(workIds.lastIndex), 0)
    }

    companion object {
        val Top = WorksListPosition(null, 0, 0)
    }
}

internal fun LazyListState.worksListPosition(): WorksListPosition {
    val index = firstVisibleItemIndex
    val workId = layoutInfo.visibleItemsInfo.firstOrNull { it.index == index }?.key as? Long
    return WorksListPosition(workId, index, firstVisibleItemScrollOffset)
}
