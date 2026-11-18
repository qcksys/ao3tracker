package com.qcksys.ao3tracker.ui.screens.track

import kotlin.test.Test
import kotlin.test.assertEquals

class WorksListPositionTest {
    @Test
    fun `restores the first visible work after reading moved another work to the top`() {
        val saved = WorksListPosition(workId = 30, index = 2, offset = 48)

        assertEquals(WorksListPosition(30, 3, 48), saved.restoreIn(listOf(50, 10, 20, 30, 40)))
    }

    @Test
    fun `falls back to the saved index without its offset when the first visible work left the list`() {
        val saved = WorksListPosition(workId = 30, index = 2, offset = 48)

        assertEquals(WorksListPosition(null, 2, 0), saved.restoreIn(listOf(10, 20, 40, 50)))
        assertEquals(WorksListPosition(null, 1, 0), saved.restoreIn(listOf(10, 20)))
    }

    @Test
    fun `starts at the top without a saved work or listed works`() {
        assertEquals(WorksListPosition.Top, WorksListPosition.Top.restoreIn(listOf(10, 20)))
        assertEquals(WorksListPosition.Top, WorksListPosition(30, 2, 48).restoreIn(emptyList()))
    }
}
