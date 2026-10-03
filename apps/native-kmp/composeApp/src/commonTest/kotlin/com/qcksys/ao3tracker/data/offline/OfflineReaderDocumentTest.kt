package com.qcksys.ao3tracker.data.offline

import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OfflineReaderDocumentTest {
    private val page = OfflinePage(1, "https://archiveofourown.org/works/123", "123", "0", "chapter", "Story", "guest", true,
        "<html><head><meta name=viewport content=width=device-width></head><body id=workskin>Story</body></html>",
        listOf(OfflineStyle("body{color:white}", "https://archiveofourown.org/skin.css", "all", false)),
        listOf(OfflineChapter("0", 1, "", "https://archiveofourown.org/works/123")))

    @Test
    fun `local document tokens do not grant access to arbitrary local URLs`() {
        val document = OfflineReaderDocument(page, emptyList(), isCurrent = { true }, readResource = { null })
        assertTrue(document.isDocumentUrl(document.url))
        assertTrue(document.isDocumentUrl(document.url + "#notes"))
        listOf("https://archiveofourown.org/works/123", document.url + "?different=true", document.url.replace("https:", "http:"),
            document.url.replace(".net", ".net.evil.test"), document.url.replace(".net", ".net:8443"),
            document.url.replace(document.token, "old-document")).forEach { assertFalse(document.isDocumentUrl(it)) }
        assertNull(document.readPath("/../../private"))
        assertNull(document.readPath("/resources/" + "a".repeat(64)))
        assertNotNull(document.readPath(document.path))
        document.close()
        assertFalse(document.isDocumentUrl(document.url))
        assertNull(document.readPath(document.path))
    }

    @Test
    fun `serves only listed intact resources and stops on an account change`() {
        var current = true
        var bytes = byteArrayOf(1, 2, 3)
        val hash = offlineResourceHash("image/png", bytes)
        val document = OfflineReaderDocument(page, listOf(OfflineResource(hash, "image/png", 3)), isCurrent = { current }, readResource = { bytes })
        assertNotNull(document.readPath("/resources/$hash"))
        bytes = byteArrayOf(3, 2, 1)
        assertNull(document.readPath("/resources/$hash"))
        current = false
        assertNull(document.readPath(document.path))
    }

    @Test
    fun `accepts only local reader events bound to the active token`() {
        val document = OfflineReaderDocument(page, emptyList(), isCurrent = { true }, readResource = { null })
        fun message(type: String, extra: String = "", token: String = document.token) = """{"type":"$type","token":"$token"$extra}"""
        assertEquals(OfflineReaderEvent.Ready, document.event(message("offlineReady")))
        assertEquals(OfflineReaderEvent.Progress(50), document.event(message("offlineProgress", ",\"scrollPercentage\":50")))
        assertNull(document.event(message("offlineProgress", ",\"scrollPercentage\":101")))
        assertNull(document.event(message("offlineReady", token = "old")))
        assertNull(document.event(message("workInfo", ",\"workId\":123")))
        assertNull(document.event(message("offlineNavigate", ",\"url\":\"https://evil.test\"")))
        val navigation = document.event(message("offlineNavigate", ",\"url\":${JsonPrimitive(page.url)}"))
        assertEquals(OfflineReaderEvent.Navigate(page.url), navigation)
        document.close()
        assertNull(document.event(message("offlineReady")))
    }

    @Test
    fun `renders ordered site styles while preserving page styling hooks and enforcing content policy`() {
        val styles = listOf(
            OfflineStyle("body{color:red}", page.url, "screen", false),
            OfflineStyle("body{color:white}", page.url, "(prefers-color-scheme: dark)", false),
            OfflineStyle("p{display:none}", page.url, "all", true)
        )
        val rendered = renderOfflineDocument(page.html, styles)
        assertTrue(rendered.contains(OFFLINE_CONTENT_POLICY))
        assertTrue(rendered.indexOf("Content-Security-Policy") < rendered.indexOf("name=viewport"))
        assertTrue(rendered.indexOf("color:red") < rendered.indexOf("color:white"))
        assertTrue(rendered.contains("<style media=\"not all\">p{display:none}</style>"))
        assertTrue(rendered.contains("<body id=workskin>Story</body>"))
        assertFalse(rendered.contains("script src"))
    }

    @Test
    fun `style strings cannot escape their HTML elements or attributes`() {
        val style = OfflineStyle("p:after{content:'</style><script>danger()</script>'}", page.url, "\"><img src=x>", false)
        val rendered = renderOfflineDocument(page.html, listOf(style))
        assertFalse(rendered.contains("</style><script>"))
        assertFalse(rendered.contains("<img"))
        assertTrue(rendered.contains("\\3c /style>"))
    }
}
