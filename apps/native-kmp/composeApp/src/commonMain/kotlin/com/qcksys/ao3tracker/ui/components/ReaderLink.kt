package com.qcksys.ao3tracker.ui.components

import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import com.qcksys.ao3tracker.util.hasValidPercentEncoding
import io.ktor.http.Url
import io.ktor.http.decodeURLPart

data class ReaderLink(val url: String, val title: String? = null) {
    private val path: String? = if (isTrustedAo3Url(url) && hasValidPercentEncoding(url)) {
        runCatching { Url(url).encodedPath }.getOrNull()
    } else null

    val workId: Long? = path?.let {
        Regex("^/(?:collections/[^/]+/)?works/([0-9]+)(?:/|$)")
            .find(it)?.groupValues?.get(1)?.toLongOrNull()?.takeIf { id -> id > 0 }
    }

    val tag: String? = path?.let {
        Regex("^/tags/([^/]+)(?:/|$)").find(it)?.groupValues?.get(1)
    }?.let { encoded ->
        runCatching { encoded.decodeURLPart() }.getOrNull()
    }?.replace("*s*", "/")?.replace("*a*", "&")?.replace("*d*", ".")
        ?.replace("*q*", "?")?.replace("*h*", "#")?.trim()?.takeIf { it.isNotEmpty() }
}

sealed interface ReaderLinkAction {
    data class TrackWork(val workId: Long, val title: String?) : ReaderLinkAction
    data class BlockWork(val workId: Long, val title: String? = null) : ReaderLinkAction
    data class BlockTag(val tag: String) : ReaderLinkAction
}
