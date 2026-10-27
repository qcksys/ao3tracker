package com.qcksys.ao3tracker.data.offline

import kotlin.test.*

class OfflineObservationTest {
    private val url = "https://archiveofourown.org/works/123"

    @Test
    fun acceptsTheSameDocumentAfterReadingScriptsUpdateNavigationParameters() {
        val requested = "$url?view_full_work=true&scrollTo=0&_t=123"
        val displayed = "$url?view_full_work=true&scroll=0#chapters"
        val body = offlineJson.encodeToString(OfflinePageObservation(requested, "user:reader", true))
        assertNotNull(parseOfflineObservation(body, displayed))
        assertNull(parseOfflineObservation(body, "$url?view_full_work=false"))
        assertNull(parseOfflineObservation(body, "$url?view_full_work=true&view_adult=true"))
        assertNull(parseOfflineObservation(body, "$url/chapters/456?view_full_work=true"))
        assertNull(parseOfflineObservation(body, "https://archiveofourown.org/collections/other/works/123?view_full_work=true"))
        assertNull(parseOfflineObservation(body, "https://elsewhere.test/works/123?view_full_work=true"))
    }

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
