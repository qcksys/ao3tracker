package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.io.encoding.Base64

internal data class OfflineLocation(
    val workId: String,
    val chapterId: String?,
    val representation: String,
    val parameters: Map<String, List<String>>
)

internal fun offlineLocation(value: String): OfflineLocation {
    require(isTrustedAo3Url(value))
    val url = offlineAssetUrl(value)
    val path = Regex("^(?:/collections/[^/]+)?/works/([0-9]+)(?:/chapters/([0-9]+))?/?$").matchEntire(url.encodedPath)
    requireNotNull(path) { "Open an AO3 work before saving it." }
    val workId = path.groupValues[1]
    require(workId.toLongOrNull()?.let { it > 0 } == true)
    val chapterId = path.groupValues[2].ifEmpty { null }
    require(chapterId == null || chapterId.toLongOrNull()?.let { it > 0 } == true)
    val parameters = url.parameters.entries().filterNot { it.key in setOf("scroll", "scrollTo", "_t") }.associate { it.key to it.value }
    return OfflineLocation(workId, chapterId, if (url.parameters["view_full_work"] == "true") "whole" else "chapter", parameters)
}

internal fun offlineSkinHash(styles: List<OfflineStyle>): String = offlineSha256(
    JsonArray(styles.map { JsonArray(listOf(JsonPrimitive(it.css), JsonPrimitive(it.media), JsonPrimitive(it.disabled))) })
        .toString().encodeToByteArray()
)

@Serializable
private data class OfflineAssetResponse(val url: String, val mimeType: String, val base64: String)

@Serializable
private data class OfflineCaptureError(val error: String)

internal class OfflineCaptureSession(
    val token: String,
    expectedUrl: String,
    private val expectedIdentity: String?,
    private val isCurrent: () -> Boolean,
    private val assets: OfflineAssetClient,
    private val stageResource: suspend (OfflineResource, ByteArray) -> Unit,
    private val publish: suspend (OfflineBundle) -> Unit
) {
    private val expected = offlineLocation(expectedUrl)
    private val receiver = OfflineTransferReceiver(token)
    private val mutex = Mutex()
    private val resources = mutableMapOf<String, OfflineResource>()
    private var storedBytes = 0L
    private var fetchedBytes = 0
    private var requests = 0
    private var lastRequest = 0L
    private var transfer: String? = null
    private var finished = false

    fun cancel() { finished = true }

    private suspend fun checkCurrent() {
        currentCoroutineContext().ensureActive()
        if (finished || !isCurrent()) throw CancellationException("Offline capture is no longer current")
    }

    private fun startRequest(id: String) {
        val number = id.toLongOrNull()
        require(number != null && number > lastRequest && transfer == null) { "Stale offline request" }
        lastRequest = number
    }

    suspend fun receive(body: String): List<OfflineResponseChunk> = mutex.withLock {
        checkCurrent()
        require(body.length <= 110_000) { "Offline message exceeds the limit" }
        val message = offlineJson.parseToJsonElement(body).jsonObject
        require(message["token"]?.jsonPrimitive?.content == token) { "Stale offline document" }
        when (message["type"]?.jsonPrimitive?.content) {
            "offlineFetch" -> {
                val fetch = offlineJson.decodeFromString<OfflineFetch>(body)
                startRequest(fetch.id)
                require(++requests <= 1000 && fetchedBytes < OFFLINE_BUNDLE_LIMIT) { "The chapter contains too many resources." }
                val response = try {
                    val asset = assets.fetch(fetch.url, minOf(OFFLINE_RESOURCE_LIMIT, OFFLINE_BUNDLE_LIMIT - fetchedBytes))
                    checkCurrent()
                    fetchedBytes += asset.bytes.size
                    offlineJson.encodeToString(OfflineAssetResponse(asset.url, asset.mimeType, Base64.encode(asset.bytes)))
                } catch (error: CancellationException) {
                    throw error
                } catch (error: OfflineThrottled) {
                    throw error
                } catch (error: OfflineAssetReadFailure) {
                    fetchedBytes += error.bytesRead
                    offlineJson.encodeToString(OfflineCaptureError("The resource could not be downloaded."))
                } catch (_: Exception) {
                    offlineJson.encodeToString(OfflineCaptureError("The resource could not be downloaded."))
                }
                checkCurrent()
                offlineResponse(token, fetch.id, response)
            }
            "offlineTransfer" -> {
                val chunk = offlineJson.decodeFromString<OfflineTransfer>(body)
                if (chunk.index == 0) { startRequest(chunk.transferId); transfer = chunk.transferId }
                val content = receiver.receive(chunk) ?: return@withLock emptyList()
                transfer = null
                when (chunk.kind) {
                    "resource" -> {
                        val resource = offlineJson.decodeFromString<OfflineResourceData>(content)
                        require(Regex("^[a-f0-9]{64}$").matches(resource.hash) && offlineAssetMime(resource.mimeType))
                        require(resource.bytes in 0..OFFLINE_RESOURCE_LIMIT.toLong())
                        require(resource.base64.length <= ((resource.bytes + 2) / 3) * 4)
                        val bytes = Base64.decode(resource.base64)
                        require(bytes.size.toLong() == resource.bytes && offlineResourceHash(resource.mimeType, bytes) == resource.hash) {
                            "The downloaded resource is corrupt."
                        }
                        val entry = OfflineResource(resource.hash, resource.mimeType, resource.bytes)
                        require(resource.hash !in resources && resources.size < 1000 && storedBytes + resource.bytes <= OFFLINE_BUNDLE_LIMIT)
                        checkCurrent()
                        stageResource(entry, bytes)
                        checkCurrent()
                        resources[resource.hash] = entry
                        storedBytes += resource.bytes
                    }
                    "bundle" -> {
                        val bundle = offlineJson.decodeFromString<OfflineBundle>(content)
                        validate(bundle)
                        checkCurrent()
                        // The publisher must also check its captured account generation inside the storage transaction.
                        publish(bundle)
                        checkCurrent()
                        finished = true
                    }
                }
                offlineResponse(token, chunk.transferId, "{}")
            }
            "offlineFailure" -> {
                offlineJson.decodeFromString<OfflineFailure>(body)
                error("The chapter could not be saved. Open it and try again.")
            }
            else -> error("Unsupported offline message")
        }
    }

    private fun validate(bundle: OfflineBundle) {
        val page = bundle.page
        val location = offlineLocation(page.url)
        require(page.version == 1 && page.workId == expected.workId && location.workId == expected.workId)
        require(page.representation == expected.representation && location.representation == expected.representation && location.parameters == expected.parameters)
        require(page.chapterId.toLongOrNull()?.let { it >= 0 } == true)
        require(expected.chapterId == null || expected.chapterId == page.chapterId)
        require(location.chapterId == null || location.chapterId == page.chapterId)
        require(page.ao3Identity == "guest" || page.ao3Identity.startsWith("user:") && page.ao3Identity.length in 6..196)
        require(expectedIdentity == null || expectedIdentity == page.ao3Identity) { "The AO3 account changed during capture." }
        require(!page.canSelectSkin || "site_skin" !in location.parameters)
        require(page.html.isNotEmpty() && page.html.length <= 8 * 1024 * 1024 && page.title.isNotBlank() && page.title.length <= 10_000)
        require(page.siteStyles.size <= 1000 && page.siteStyles.sumOf { it.css.length.toLong() } <= 8 * 1024 * 1024)
        require(offlineSkinHash(page.siteStyles) == bundle.skinHash) { "The saved skin is corrupt." }
        require(bundle.resources.size == resources.size && bundle.resources.distinctBy { it.hash }.size == bundle.resources.size)
        require(bundle.resources.all { resources[it.hash] == it }) { "The chapter has incomplete resources." }
        require(bundle.missingResources.size <= 1000 && bundle.missingResources.all { it.length <= 8192 })
        require(page.chapters.isNotEmpty() && page.chapters.size <= 50_000 && page.chapters.distinctBy { it.id }.size == page.chapters.size)
        page.chapters.forEachIndexed { index, chapter ->
            val chapterLocation = offlineLocation(chapter.url)
            require(chapter.number == index + 1 && chapter.id.toLongOrNull()?.let { it >= 0 } == true)
            require(chapterLocation.workId == page.workId && (chapterLocation.chapterId == chapter.id ||
                chapterLocation.chapterId == null && page.chapters.size == 1 && chapter.id == page.chapterId))
        }
        require(page.representation == "whole" || page.chapters.any { it.id == page.chapterId })
    }
}
