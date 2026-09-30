package com.qcksys.ao3tracker.webview

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TrustedAo3OriginTest {
    @Test
    fun `only HTTPS AO3 origins are trusted`() {
        listOf("https://archiveofourown.org", "https://www.archiveofourown.org/works/1", "https://ARCHIVEOFOUROWN.ORG:443/tags").forEach {
            assertTrue(isTrustedAo3Url(it), it)
        }
        listOf("http://archiveofourown.org", "https://archiveofourown.org.evil.test", "https://archiveofourown.org@evil.test", "https://evil.test/archiveofourown.org", "https://archiveofourown.org:8443", "javascript:alert(1)", "https://archiveofourown.org\\@evil.test").forEach {
            assertFalse(isTrustedAo3Url(it), it)
        }
        assertTrue(isTrustedAo3Origin("https", "archiveofourown.org", 443))
        assertFalse(isTrustedAo3Origin("https", "evil.test", 443))
        assertFalse(isTrustedAo3Origin("http", "archiveofourown.org", 80))
    }
}
