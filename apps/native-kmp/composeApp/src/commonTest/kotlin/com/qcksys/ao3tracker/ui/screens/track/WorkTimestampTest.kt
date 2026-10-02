package com.qcksys.ao3tracker.ui.screens.track

import kotlin.test.Test
import kotlin.test.assertEquals

class WorkTimestampTest {
    @Test
    fun timestampsStayRelativeAcrossTimeBoundaries() {
        val now = 1_800_000_000_000L
        val minute = 60_000L
        val hour = 60 * minute
        val day = 24 * hour
        val cases = listOf(
            -minute to "Just now",
            0L to "Just now",
            minute - 1 to "Just now",
            minute to "1 min ago",
            hour - 1 to "59 min ago",
            hour to "1 hour ago",
            2 * hour to "2 hours ago",
            day - 1 to "23 hours ago",
            day to "1 day ago",
            2 * day to "2 days ago",
            7 * day to "7 days ago",
            365 * day to "365 days ago"
        )

        for ((elapsed, expected) in cases) {
            assertEquals(expected, formatWorkTimestamp(now - elapsed, now), "Elapsed: $elapsed")
        }
    }
}
