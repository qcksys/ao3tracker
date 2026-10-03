package com.qcksys.ao3tracker.data.offline

import kotlin.test.*

class OfflineObservationTest {
    private val url = "https://archiveofourown.org/works/123"

    @Test
    fun acceptsTheCurrentPageAndAllowsUnknownIdentityWithoutTreatingItAsLogout() {
        val body = offlineJson.encodeToString(OfflinePageObservation(url, "user:reader", true))
        assertEquals("user:reader", parseOfflineObservation(body, "$url#chapters")?.identity)
        val unknown = offlineJson.encodeToString(OfflinePageObservation(url, null, false))
        assertNotNull(parseOfflineObservation(unknown, url))
        val logout = "https://archiveofourown.org/users/login"
        assertEquals("guest", parseOfflineObservation(offlineJson.encodeToString(OfflinePageObservation(logout, "guest", false)), logout)?.identity)
    }

    @Test
    fun rejectsOtherDocumentsAndInvalidReadableClaims() {
        val body = offlineJson.encodeToString(OfflinePageObservation(url, "user:reader", true))
        assertNull(parseOfflineObservation(body, "https://archiveofourown.org/works/456"))
        assertNull(parseOfflineObservation(offlineJson.encodeToString(OfflinePageObservation(url, null, true)), url))
        val login = "https://archiveofourown.org/users/login"
        assertNull(parseOfflineObservation(offlineJson.encodeToString(OfflinePageObservation(login, "guest", true)), login))
        assertNull(parseOfflineObservation("x".repeat(16_385), url))
    }
}
