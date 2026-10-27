package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import io.ktor.http.URLBuilder
import kotlinx.serialization.Serializable

@Serializable
data class OfflinePageObservation(val url: String, val identity: String?, val readable: Boolean)

internal fun sameOfflinePage(first: String?, second: String?): Boolean {
    if (first == null || second == null || !isTrustedAo3Url(first) || !isTrustedAo3Url(second)) return false
    return runCatching {
        fun pageUrl(value: String) = URLBuilder(offlineAssetUrl(value)).apply {
            parameters.remove("scroll")
            parameters.remove("scrollTo")
            parameters.remove("_t")
            fragment = ""
        }.buildString()
        pageUrl(first) == pageUrl(second)
    }.getOrDefault(false)
}

internal fun parseOfflineObservation(body: String, expectedUrl: String): OfflinePageObservation? = runCatching {
    if (body.length > 16_384) return null
    val result = offlineJson.decodeFromString<OfflinePageObservation>(body)
    if (!sameOfflinePage(result.url, expectedUrl)) return null
    if (result.identity != null && result.identity != "guest" &&
        (!result.identity.startsWith("user:") || result.identity.length !in 6..196)) return null
    if (result.readable && (result.identity == null || runCatching { offlineLocation(result.url) }.isFailure)) return null
    result
}.getOrNull()
