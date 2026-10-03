package com.qcksys.ao3tracker.data.offline

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlin.io.encoding.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class OfflineCaptureSessionTest {
    private val url = "https://archiveofourown.org/works/123/chapters/456"
    private val styles = listOf(OfflineStyle("body{color:white}", url, "screen", false))
    private fun bundle() = OfflineBundle(
        OfflinePage(1, url, "123", "456", "chapter", "Story", "user:reader", true,
            "<html><head></head><body><div id=chapters>Story</div></body></html>", styles,
            listOf(OfflineChapter("456", 1, "Chapter", url))),
        offlineSkinHash(styles), emptyList(), emptyList()
    )

    private fun message(content: String, id: String = "1", kind: String = "bundle", token: String = "active") =
        offlineJson.encodeToString(OfflineTransfer("offlineTransfer", token, id, kind, 0, 1, content))

    private fun session(
        isCurrent: () -> Boolean = { true },
        stage: suspend (OfflineResource, ByteArray) -> Unit = { _, _ -> },
        publish: suspend (OfflineBundle) -> Unit = {}
    ) = OfflineCaptureSession("active", url, "user:reader", isCurrent,
        OfflineAssetClient({ null }) { _, _, _ -> OfflineHttpResult(404) }, stage, publish)

    @Test
    fun `publishes only after all referenced resources have been verified and staged`() = runTest {
        val bytes = "image".encodeToByteArray()
        val hash = offlineResourceHash("image/png", bytes)
        val resource = OfflineResourceData(hash, "image/png", bytes.size.toLong(), Base64.encode(bytes))
        val expected = bundle().copy(resources = listOf(OfflineResource(hash, "image/png", bytes.size.toLong())))
        val events = mutableListOf<String>()
        val capture = session(stage = { _, _ -> events += "staged" }, publish = { assertEquals(expected, it); events += "published" })
        val reply = capture.receive(message(offlineJson.encodeToString(resource), kind = "resource"))
        assertEquals("active", reply.single().token)
        assertEquals(listOf("staged"), events)
        capture.receive(message(offlineJson.encodeToString(expected), id = "2"))
        assertEquals(listOf("staged", "published"), events)
        assertFailsWith<CancellationException> { capture.receive(message(offlineJson.encodeToString(expected), id = "3")) }
    }

    @Test
    fun `does not publish incomplete forged or mismatched snapshots`() = runTest {
        val valid = bundle()
        val invalid = listOf(
            valid.copy(page = valid.page.copy(workId = "999")),
            valid.copy(page = valid.page.copy(chapterId = "999")),
            valid.copy(page = valid.page.copy(ao3Identity = "user:someoneElse")),
            valid.copy(page = valid.page.copy(url = "https://evil.test/works/123/chapters/456")),
            valid.copy(page = valid.page.copy(siteStyles = listOf(styles.single().copy(css = "body{color:red}")))),
            valid.copy(resources = listOf(OfflineResource("a".repeat(64), "text/css", 10))),
            valid.copy(page = valid.page.copy(chapters = listOf(OfflineChapter("789", 1, "Chapter", "https://archiveofourown.org/works/999/chapters/789"))))
        )
        invalid.forEach { value ->
            val capture = session(publish = { error("Invalid content was published") })
            assertFailsWith<IllegalArgumentException> { capture.receive(message(offlineJson.encodeToString(value))) }
        }
    }

    @Test
    fun `validates actual resource bytes before writing any file`() = runTest {
        val resource = OfflineResourceData("a".repeat(64), "image/png", 1, "YQ==")
        val capture = session(stage = { _, _ -> error("Corrupt resource was written") })
        assertFailsWith<IllegalArgumentException> {
            capture.receive(message(offlineJson.encodeToString(resource), kind = "resource"))
        }
    }

    @Test
    fun `rejects account changes during a resource write and prevents publication`() = runTest {
        var current = true
        val bytes = byteArrayOf(1)
        val resource = OfflineResourceData(offlineResourceHash("image/png", bytes), "image/png", 1, Base64.encode(bytes))
        val capture = session(isCurrent = { current }, stage = { _, _ -> current = false }, publish = { error("Stale content was published") })
        assertFailsWith<CancellationException> { capture.receive(message(offlineJson.encodeToString(resource), kind = "resource")) }
        assertFailsWith<CancellationException> { capture.receive(message(offlineJson.encodeToString(bundle()), id = "2")) }
    }

    @Test
    fun `a failed storage write cannot be acknowledged or included in a completed chapter`() = runTest {
        val bytes = byteArrayOf(1)
        val hash = offlineResourceHash("image/png", bytes)
        val resource = OfflineResourceData(hash, "image/png", 1, Base64.encode(bytes))
        val capture = session(stage = { _, _ -> error("Disk full") }, publish = { error("Incomplete content was published") })
        assertFailsWith<IllegalStateException> { capture.receive(message(offlineJson.encodeToString(resource), kind = "resource")) }
        assertFailsWith<IllegalArgumentException> {
            capture.receive(message(offlineJson.encodeToString(bundle().copy(resources = listOf(OfflineResource(hash, "image/png", 1)))), id = "2"))
        }
    }

    @Test
    fun `cancels a fetch if its document changes while the request is in flight`() = runTest {
        var current = true
        val capture = OfflineCaptureSession("active", url, "user:reader", { current },
            OfflineAssetClient({ null }) { _, _, _ ->
                current = false
                OfflineHttpResult(200, "text/css", "body{}".encodeToByteArray())
            }, { _, _ -> }, {})
        val request = offlineJson.encodeToString(OfflineFetch("offlineFetch", "active", "1", "https://archiveofourown.org/skin.css"))
        assertFailsWith<CancellationException> { capture.receive(request) }
    }

    @Test
    fun `rejects stale tokens and duplicate completed requests`() = runTest {
        val capture = session()
        assertFailsWith<IllegalArgumentException> { capture.receive(message(offlineJson.encodeToString(bundle()), token = "old")) }
        val request = offlineJson.encodeToString(OfflineFetch("offlineFetch", "active", "1", "https://archiveofourown.org/skin.css"))
        assertTrue(capture.receive(request).single().text.contains("error"))
        assertFailsWith<IllegalArgumentException> { capture.receive(request) }
    }

    @Test
    fun `failed streamed assets consume the total network budget`() = runTest {
        val limits = mutableListOf<Int>()
        val capture = OfflineCaptureSession("active", url, "user:reader", { true },
            OfflineAssetClient({ null }) { _, _, limit ->
                limits.add(limit)
                throw OfflineAssetReadFailure(limit + 1, IllegalArgumentException("Too large"))
            }, { _, _ -> }, {})
        for (id in 1..4) {
            val request = offlineJson.encodeToString(OfflineFetch("offlineFetch", "active", "$id", "https://images.example/$id.png"))
            assertTrue(capture.receive(request).single().text.contains("error"))
        }
        assertEquals(listOf(OFFLINE_RESOURCE_LIMIT, OFFLINE_RESOURCE_LIMIT, OFFLINE_RESOURCE_LIMIT, OFFLINE_RESOURCE_LIMIT - 3), limits)
        assertFailsWith<IllegalArgumentException> {
            capture.receive(offlineJson.encodeToString(OfflineFetch("offlineFetch", "active", "5", "https://images.example/5.png")))
        }
        assertEquals(4, limits.size)
    }

    @Test
    fun `normalizes transport parameters but preserves representation and skin options`() {
        val plain = offlineLocation(url)
        assertEquals(plain, offlineLocation("https://www.archiveofourown.org:443/works/123/chapters/456?scrollTo=0&_t=12#notes"))
        assertEquals("whole", offlineLocation("$url?view_full_work=true").representation)
        assertEquals(listOf("1"), offlineLocation("$url?site_skin=1").parameters["site_skin"])
    }
}
