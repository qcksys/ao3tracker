package com.qcksys.ao3tracker.data.offline

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class OfflineTransferTest {
    private fun chunk(index: Int, text: String, total: Int = 2, token: String = "active", id: String = "one") =
        OfflineTransfer("offlineTransfer", token, id, "bundle", index, total, text)

    @Test
    fun `assembles complete ordered documents and accepts the next transfer`() {
        val receiver = OfflineTransferReceiver("active")
        assertNull(receiver.receive(chunk(0, "first")))
        assertEquals("firstsecond", receiver.receive(chunk(1, "second")))
        assertEquals("next", receiver.receive(chunk(0, "next", total = 1, id = "two")))
    }

    @Test
    fun `rejects stale accounts and interleaved or duplicated chunks`() {
        val receiver = OfflineTransferReceiver("active")
        assertFailsWith<IllegalArgumentException> { receiver.receive(chunk(0, "old", token = "previous")) }
        assertNull(receiver.receive(chunk(0, "first")))
        assertFailsWith<IllegalArgumentException> { receiver.receive(chunk(0, "duplicate")) }
        assertFailsWith<IllegalArgumentException> { receiver.receive(chunk(1, "other", id = "two")) }
        assertFailsWith<IllegalArgumentException> { receiver.receive(chunk(1, "changed count", total = 3)) }
    }

    @Test
    fun `bounds payloads before appending their contents`() {
        val receiver = OfflineTransferReceiver("active")
        assertFailsWith<IllegalArgumentException> { receiver.receive(chunk(0, "x".repeat(16_385))) }
        assertFailsWith<IllegalArgumentException> { receiver.receive(chunk(0, "", total = 2049)) }
        assertFailsWith<IllegalArgumentException> { receiver.receive(chunk(1, "missing start")) }
    }

    @Test
    fun `response chunks round trip non ASCII content including split surrogate pairs`() {
        val text = "x".repeat(16_383) + "📚" + "end"
        val chunks = offlineResponse("active", "response", text)
        assertEquals(2, chunks.size)
        assertEquals(text, chunks.joinToString("") { it.text })
        assertEquals(listOf(0, 1), chunks.map { it.index })
        assertEquals(setOf("active"), chunks.map { it.token }.toSet())
    }
}
