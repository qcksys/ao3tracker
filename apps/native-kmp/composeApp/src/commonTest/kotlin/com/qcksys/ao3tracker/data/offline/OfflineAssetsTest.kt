package com.qcksys.ao3tracker.data.offline

import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals

class OfflineAssetsTest {
    @Test
    fun `cookies never cross an origin boundary even if a redirect returns to AO3`() = runTest {
        val cookies = mutableListOf<String?>()
        val addresses = mutableListOf<String>()
        val client = OfflineAssetClient({ "session=private" }) { url, cookie, _ ->
            addresses += url
            cookies += cookie
            when (addresses.size) {
                1 -> OfflineHttpResult(302, location = "/skin.css")
                2 -> OfflineHttpResult(302, location = "https://images.example/skin.css")
                3 -> OfflineHttpResult(302, location = "https://archiveofourown.org/final.css")
                else -> OfflineHttpResult(200, "text/css; charset=utf-8", "body{}".encodeToByteArray())
            }
        }
        val result = client.fetch("https://archiveofourown.org/original.css")
        assertEquals(listOf("session=private", "session=private", null, null), cookies)
        assertEquals("https://archiveofourown.org/skin.css", addresses[1])
        assertEquals("https://archiveofourown.org/final.css", result.url)
        assertEquals("text/css", result.mimeType)
    }

    @Test
    fun `external resources never request AO3 cookies`() = runTest {
        val client = OfflineAssetClient({ error("Cookie access was not expected") }) { _, cookie, _ ->
            assertEquals(null, cookie)
            OfflineHttpResult(200, "image/png", byteArrayOf(1))
        }
        assertContentEquals(byteArrayOf(1), client.fetch("https://images.example/art.png").bytes)
    }

    @Test
    fun `rejects insecure or credential-bearing destinations before fetching`() = runTest {
        val client = OfflineAssetClient({ null }) { _, _, _ -> error("Unexpected network request") }
        listOf("http://archiveofourown.org/a.css", "https://user:secret@example.org/a", "file:///private/file", "https://archiveofourown.org\\@evil.test/a").forEach {
            assertFailsWith<IllegalArgumentException> { client.fetch(it) }
        }
        val redirect = OfflineAssetClient({ null }) { _, _, _ -> OfflineHttpResult(302, location = "http://images.example/image") }
        assertFailsWith<IllegalArgumentException> { redirect.fetch("https://archiveofourown.org/a") }
    }

    @Test
    fun `rejects redirect loops login pages failed responses and excessive bytes`() = runTest {
        listOf(
            OfflineHttpResult(302, location = "/a"),
            OfflineHttpResult(200, "text/html", "Login".encodeToByteArray()),
            OfflineHttpResult(404, "text/css"),
            OfflineHttpResult(200, "image/png", byteArrayOf(1, 2, 3))
        ).forEach { response ->
            val client = OfflineAssetClient({ null }) { _, _, _ -> response }
            assertFailsWith<IllegalArgumentException> { client.fetch("https://archiveofourown.org/a", limit = 2) }
        }
    }

    @Test
    fun `preserves rate limit information for the shared AO3 cooldown`() = runTest {
        val client = OfflineAssetClient({ null }) { _, _, _ -> OfflineHttpResult(429, retryAfter = "600") }
        val error = assertFailsWith<OfflineThrottled> { client.fetch("https://archiveofourown.org/a.css") }
        assertEquals("600", error.retryAfter)
    }

    @Test
    fun `bounds streamed bodies without trusting a content length header`() = runTest {
        assertContentEquals(byteArrayOf(1, 2), readOfflineBytes(ByteReadChannel(byteArrayOf(1, 2)), 2))
        assertContentEquals(byteArrayOf(), readOfflineBytes(ByteReadChannel(byteArrayOf()), 2))
        assertEquals(3, assertFailsWith<OfflineAssetReadFailure> { readOfflineBytes(ByteReadChannel(byteArrayOf(1, 2, 3)), 2) }.bytesRead)
        val bytes = ByteArray(40_000) { (it % 255).toByte() }
        assertContentEquals(bytes, readOfflineBytes(ByteReadChannel(bytes), bytes.size))
    }

    @Test
    fun `content hashes include media type and match SHA256 test vectors`() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", offlineSha256(byteArrayOf()))
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", offlineSha256("abc".encodeToByteArray()))
        assertNotEquals(offlineResourceHash("image/png", byteArrayOf()), offlineResourceHash("text/css", byteArrayOf()))
    }
}
