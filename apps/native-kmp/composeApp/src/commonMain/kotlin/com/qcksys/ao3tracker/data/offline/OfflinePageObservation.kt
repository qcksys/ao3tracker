package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import kotlinx.serialization.Serializable

@Serializable
data class OfflinePageObservation(val url: String, val identity: String?, val readable: Boolean)

internal fun parseOfflineObservation(body: String, expectedUrl: String): OfflinePageObservation? = runCatching {
    if (body.length > 16_384) return null
    val result = offlineJson.decodeFromString<OfflinePageObservation>(body)
    if (!isTrustedAo3Url(result.url) || result.url.substringBefore('#') != expectedUrl.substringBefore('#')) return null
    if (result.identity != null && result.identity != "guest" &&
        (!result.identity.startsWith("user:") || result.identity.length !in 6..196)) return null
    if (result.readable && (result.identity == null || runCatching { offlineLocation(result.url) }.isFailure)) return null
    result
}.getOrNull()
