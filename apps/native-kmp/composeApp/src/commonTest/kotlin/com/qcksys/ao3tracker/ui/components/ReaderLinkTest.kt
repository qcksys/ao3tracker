package com.qcksys.ao3tracker.ui.components

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ReaderLinkTest {
    @Test
    fun identifiesWorkAndChapterLinksIncludingCollections() {
        listOf(
            "https://archiveofourown.org/works/123?view_adult=true#chapter_2",
            "https://www.archiveofourown.org:443/works/123/chapters/456",
            "https://archiveofourown.org/collections/Example/works/123"
        ).forEach { assertEquals(123L, ReaderLink(it).workId) }
    }

    @Test
    fun decodesAo3TagsWithoutChangingPlusSigns() {
        val link = ReaderLink("https://archiveofourown.org/tags/A%20*s*%20B%20*a*%20C*d*%20*q*%20*h*%20D+E/works")
        assertEquals("A / B & C. ? # D+E", link.tag)
        assertEquals("Café", ReaderLink("https://archiveofourown.org/tags/Caf%C3%A9").tag)
        assertEquals("A/B", ReaderLink("https://archiveofourown.org/tags/A%2As%2AB/works").tag)
        assertEquals("%ZZ", ReaderLink("https://archiveofourown.org/tags/%25ZZ/works").tag)
    }

    @Test
    fun rejectsUntrustedLinksAndInvalidWorkIds() {
        listOf(
            "https://archiveofourown.org.evil.test/works/123",
            "https://archiveofourown.org@evil.test/tags/Fluff",
            "http://archiveofourown.org/works/123",
            "https://archiveofourown.org:444/tags/Fluff",
            "https://example.com/works/123"
        ).forEach {
            assertNull(ReaderLink(it).workId)
            assertNull(ReaderLink(it).tag)
        }
        listOf("search", "0", "-1", "123abc", "999999999999999999999").forEach {
            assertNull(ReaderLink("https://archiveofourown.org/works/$it").workId)
        }
        listOf("%ZZ", "%", "%2", "%2Z").forEach {
            assertNull(ReaderLink("https://archiveofourown.org/tags/$it").tag)
        }
        assertNull(ReaderLink("https://archiveofourown.org/tags/%20/works").tag)
    }
}
