package com.qcksys.ao3tracker.data.push

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NotificationNavigationTest {
    @Test
    fun opensRemoteStringAndLocalLongWorkIds() {
        assertEquals(123L, notificationWorkId("123", -1))
        assertEquals(456L, notificationWorkId(null, 456))
        assertEquals(123L, notificationWorkId("123", 456))
    }

    @Test
    fun rejectsMissingMalformedNonpositiveAndOverflowWorkIds() {
        for (value in listOf(null, "", "garbage", "https://attacker.example", "-1", "0", "9223372036854775808")) {
            assertNull(notificationWorkId(value, -1))
        }
    }
}
