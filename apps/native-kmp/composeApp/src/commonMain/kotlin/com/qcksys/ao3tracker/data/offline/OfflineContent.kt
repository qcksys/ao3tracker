package com.qcksys.ao3tracker.data.offline

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

internal val offlineJson = Json { ignoreUnknownKeys = false; encodeDefaults = true }

@Serializable
data class OfflineStyle(val css: String, val sourceUrl: String, val media: String, val disabled: Boolean)

@Serializable
data class OfflineChapter(val id: String, val number: Int, val title: String, val url: String)

@Serializable
data class OfflinePage(
    val version: Int,
    val url: String,
    val workId: String,
    val chapterId: String,
    val representation: String,
    val title: String,
    val ao3Identity: String,
    val canSelectSkin: Boolean,
    val html: String,
    val siteStyles: List<OfflineStyle>,
    val chapters: List<OfflineChapter>,
    val downloadUpdatedAt: String? = null
)

@Serializable
data class OfflineResource(val hash: String, val mimeType: String, val bytes: Long)

@Serializable
data class OfflineResourceData(val hash: String, val mimeType: String, val bytes: Long, val base64: String)

@Serializable
data class OfflineBundle(
    val page: OfflinePage,
    val skinHash: String,
    val resources: List<OfflineResource>,
    val missingResources: List<String>
)

@Serializable
data class OfflineTransfer(
    val type: String,
    val token: String,
    val transferId: String,
    val kind: String,
    val index: Int,
    val total: Int,
    val text: String
)

@Serializable
data class OfflineFetch(val type: String, val token: String, val id: String, val url: String)

@Serializable
data class OfflineFailure(val type: String, val token: String, val message: String)

@Serializable
data class OfflineResponseChunk(val token: String, val id: String, val index: Int, val total: Int, val text: String)

class OfflineTransferReceiver(private val token: String) {
    private var transferId: String? = null
    private var kind: String? = null
    private var total = 0
    private var nextIndex = 0
    private val text = StringBuilder()

    fun receive(chunk: OfflineTransfer): String? {
        require(chunk.type == "offlineTransfer" && chunk.token == token) { "Stale offline transfer" }
        require(chunk.transferId.isNotEmpty() && chunk.kind in setOf("resource", "bundle"))
        require(chunk.total in 1..2048 && chunk.index in 0 until chunk.total && chunk.text.length <= 16_384)
        if (transferId == null) {
            require(chunk.index == 0) { "Missing offline transfer start" }
            transferId = chunk.transferId
            kind = chunk.kind
            total = chunk.total
        }
        require(chunk.transferId == transferId && chunk.kind == kind && chunk.total == total && chunk.index == nextIndex) {
            "Incomplete offline transfer"
        }
        text.append(chunk.text)
        nextIndex++
        if (nextIndex != total) return null
        return text.toString().also { reset() }
    }

    fun reset() {
        transferId = null
        kind = null
        total = 0
        nextIndex = 0
        text.clear()
    }
}

internal fun offlineResponse(token: String, id: String, text: String): List<OfflineResponseChunk> {
    require(text.length <= 2048 * 16_384)
    val chunks = text.chunked(16_384).ifEmpty { listOf("") }
    return chunks.mapIndexed { index, chunk -> OfflineResponseChunk(token, id, index, chunks.size, chunk) }
}
