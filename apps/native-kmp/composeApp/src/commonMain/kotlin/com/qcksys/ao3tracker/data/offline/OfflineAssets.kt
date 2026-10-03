package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.header
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.HttpHeaders
import io.ktor.http.URLBuilder
import io.ktor.http.URLProtocol
import io.ktor.http.Url
import io.ktor.http.takeFrom
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readAvailable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.CancellationException

internal const val OFFLINE_RESOURCE_LIMIT = 16 * 1024 * 1024
internal const val OFFLINE_BUNDLE_LIMIT = 64 * 1024 * 1024

internal fun offlineAssetUrl(value: String): Url {
    require(value.length <= 8192 && '\\' !in value && value.none { it.code < 32 })
    val url = Url(value)
    require(url.protocol == URLProtocol.HTTPS && url.host.isNotEmpty() && url.user == null && url.password == null) {
        "Unsupported download address"
    }
    return url
}

internal fun offlineAssetMime(mime: String): Boolean =
    mime == "text/css" || Regex("^(image/[-+.a-z0-9]+|font/[-+.a-z0-9]+|application/(font-woff|vnd.ms-fontobject|x-font-[-+.a-z0-9]+))$").matches(mime)

internal data class OfflineHttpResult(
    val status: Int,
    val mimeType: String = "",
    val body: ByteArray = byteArrayOf(),
    val location: String? = null,
    val retryAfter: String? = null
)

internal data class OfflineFetchedAsset(val url: String, val mimeType: String, val bytes: ByteArray)

internal class OfflineThrottled(val retryAfter: String?) : Exception("AO3 has paused downloads. Try again later.")
internal class OfflineAssetReadFailure(val bytesRead: Int, cause: Exception) : IllegalArgumentException("The resource could not be downloaded within its limit.", cause)

internal class OfflineAssetClient(
    private val cookies: suspend (String) -> String?,
    private val request: suspend (url: String, cookie: String?, limit: Int) -> OfflineHttpResult
) {
    suspend fun fetch(source: String, limit: Int = OFFLINE_RESOURCE_LIMIT): OfflineFetchedAsset {
        require(limit in 1..OFFLINE_RESOURCE_LIMIT)
        var url = offlineAssetUrl(source)
        var cookiesAllowed = isTrustedAo3Url(url.toString())
        val visited = mutableSetOf<String>()
        repeat(6) {
            currentCoroutineContext().ensureActive()
            val address = url.toString()
            require(visited.add(address)) { "The resource has a redirect loop." }
            val cookie = if (cookiesAllowed) cookies(address) else null
            val result = request(address, cookie, limit)
            if (result.status in setOf(301, 302, 303, 307, 308)) {
                val target = requireNotNull(result.location) { "The redirect has no destination." }
                require('\\' !in target && target.none { character -> character.code < 32 })
                val next = offlineAssetUrl(URLBuilder(url).takeFrom(target).buildString())
                if (next.host != url.host || next.port != url.port) cookiesAllowed = false
                url = next
            } else {
                if (isTrustedAo3Url(address) && result.status in setOf(429, 503)) throw OfflineThrottled(result.retryAfter)
                require(result.status == 200) { "The resource could not be downloaded." }
                val mime = result.mimeType.substringBefore(';').trim().lowercase()
                require(offlineAssetMime(mime)) { "The resource is not a stylesheet, image, or font." }
                require(result.body.size <= limit) { "The resource exceeds the download limit." }
                return OfflineFetchedAsset(address, mime, result.body)
            }
        }
        error("The resource redirected too many times.")
    }
}

internal class OfflineHttpTransport {
    // A separate client has no tracker bearer token, API cookies, or authentication plugins.
    private val client = HttpClient {
        followRedirects = false
        expectSuccess = false
        install(HttpTimeout) {
            requestTimeoutMillis = 25_000
            connectTimeoutMillis = 10_000
            socketTimeoutMillis = 15_000
        }
    }

    suspend fun request(url: String, cookie: String?, limit: Int): OfflineHttpResult =
        client.prepareGet(url) {
            if (!cookie.isNullOrEmpty()) header(HttpHeaders.Cookie, cookie)
            header(HttpHeaders.CacheControl, "no-cache")
        }.execute { response ->
            val status = response.status.value
            val mime = response.headers[HttpHeaders.ContentType].orEmpty()
            val body = if (status == 200) {
                require(offlineAssetMime(mime.substringBefore(';').trim().lowercase())) { "Unsupported resource type" }
                val contentLength = response.headers[HttpHeaders.ContentLength]?.toLongOrNull()
                require(contentLength == null || contentLength in 0..limit.toLong()) { "The resource exceeds the download limit." }
                readOfflineBytes(response.bodyAsChannel(), limit)
            } else byteArrayOf()
            OfflineHttpResult(status, mime, body, response.headers[HttpHeaders.Location], response.headers[HttpHeaders.RetryAfter])
        }

    fun close() = client.close()
}

internal suspend fun readOfflineBytes(channel: ByteReadChannel, limit: Int): ByteArray {
    require(limit in 1..OFFLINE_RESOURCE_LIMIT)
    val chunks = mutableListOf<ByteArray>()
    var count = 0
    try {
        while (true) {
            val chunk = ByteArray(minOf(16_384, limit - count + 1))
            val read = channel.readAvailable(chunk)
            if (read == -1) break
            count += read
            require(count <= limit) { "The resource exceeds the download limit." }
            if (read > 0) chunks += chunk.copyOf(read)
        }
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        throw OfflineAssetReadFailure(count, error)
    }
    return ByteArray(count).also { result ->
        var offset = 0
        chunks.forEach { chunk -> chunk.copyInto(result, offset); offset += chunk.size }
    }
}

internal expect fun offlineSha256(bytes: ByteArray): String

internal fun offlineResourceHash(mimeType: String, bytes: ByteArray): String =
    offlineSha256((mimeType + '\u0000').encodeToByteArray() + bytes)
