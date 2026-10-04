package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.webview.OfflineReaderScriptGenerated
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import io.ktor.http.URLProtocol
import io.ktor.http.Url
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlin.uuid.Uuid

internal const val OFFLINE_ORIGIN = "https://appassets.androidplatform.net"
internal const val OFFLINE_CONTENT_POLICY = "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"

internal data class OfflinePayload(val mimeType: String, val bytes: ByteArray)

internal sealed interface OfflineReaderEvent {
    data object Ready : OfflineReaderEvent
    data class Progress(val percentage: Int) : OfflineReaderEvent
    data class Navigate(val url: String) : OfflineReaderEvent
}

@Serializable
internal data class OfflineReaderOptions(
    val token: String,
    val canonicalUrl: String,
    val workId: String,
    val chapterId: String,
    val scrollPercentage: Float,
    val fragment: String
)

internal class OfflineReaderDocument(
    val page: OfflinePage,
    resources: List<OfflineResource>,
    styles: List<OfflineStyle> = page.siteStyles,
    scrollPercentage: Float = 0f,
    fragment: String = "",
    private val isCurrent: () -> Boolean,
    private val readResource: (String) -> ByteArray?,
    private val onClose: () -> Unit = {}
) {
    val token: String = Uuid.random().toString()
    val path = "/documents/$token.html"
    val url = OFFLINE_ORIGIN + path
    private val closed = MutableStateFlow(false)
    private val allowedResources = resources.associateBy { it.hash }
    private val html = renderOfflineDocument(page.html, styles).encodeToByteArray()
    private var options = OfflineReaderOptions(token, page.url, page.workId, page.chapterId, scrollPercentage, fragment)

    init {
        offlineLocation(page.url)
        require(scrollPercentage.isFinite() && scrollPercentage in 0f..100f)
        require(resources.size == allowedResources.size)
    }

    fun close() { if (closed.compareAndSet(false, true)) onClose() }
    fun isActive(): Boolean = !closed.value && isCurrent()

    fun restoreAt(percentage: Float) {
        require(percentage.isFinite() && percentage in 0f..100f)
        options = options.copy(scrollPercentage = percentage, fragment = "")
    }

    fun isDocumentUrl(value: String?): Boolean = runCatching {
        if (value == null || !isActive()) return false
        val candidate = Url(value)
        candidate.protocol == URLProtocol.HTTPS && candidate.host == "appassets.androidplatform.net" &&
            candidate.port == 443 && candidate.user == null && candidate.password == null &&
            candidate.encodedPath == path && candidate.parameters.isEmpty()
    }.getOrDefault(false)

    fun readPath(path: String): OfflinePayload? {
        if (!isActive()) return null
        if (path == this.path) return OfflinePayload("text/html", html)
        val hash = Regex("^/resources/([a-f0-9]{64})$").matchEntire(path)?.groupValues?.get(1) ?: return null
        val entry = allowedResources[hash] ?: return null
        val bytes = readResource(hash) ?: return null
        if (!isActive() || entry.bytes != bytes.size.toLong() || offlineResourceHash(entry.mimeType, bytes) != hash) return null
        return OfflinePayload(entry.mimeType, bytes)
    }

    fun initializationScript(): String {
        val optionsJson = offlineJson.encodeToString(options)
        return """
            if (window.top === window && location.href.split('#')[0] === ${JsonPrimitive(url)}) {
                window.__ao3OfflineReaderOptions = $optionsJson;
                ${OfflineReaderScriptGenerated.script}
            }
        """.trimIndent()
    }

    fun event(body: String): OfflineReaderEvent? = runCatching {
        if (!isActive() || body.length > 32_768) return null
        val message = offlineJson.parseToJsonElement(body).jsonObject
        if ((message["token"] as? JsonPrimitive)?.contentOrNull != token) return null
        when ((message["type"] as? JsonPrimitive)?.contentOrNull) {
            "offlineReady" -> OfflineReaderEvent.Ready
            "offlineProgress" -> (message["scrollPercentage"] as? JsonPrimitive)?.intOrNull
                ?.takeIf { it in 0..100 }?.let { OfflineReaderEvent.Progress(it) }
            "offlineNavigate" -> (message["url"] as? JsonPrimitive)?.contentOrNull
                ?.takeIf { it.length <= 8192 && isTrustedAo3Url(it) }?.let { OfflineReaderEvent.Navigate(it) }
            else -> null
        }
    }.getOrNull()
}

internal fun renderOfflineDocument(html: String, styles: List<OfflineStyle>): String {
    val head = Regex("<head(?:\\s[^>]*)?>").find(html) ?: error("The saved chapter has no document head.")
    val end = html.indexOf("</head>", head.range.last)
    require(end >= 0)
    fun attribute(value: String) = value.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    val sheets = styles.joinToString("") { style ->
        val media = attribute(if (style.disabled) "not all" else style.media)
        "<style media=\"$media\">" + style.css.replace(Regex("</style", RegexOption.IGNORE_CASE)) { "\\3c /style" } + "</style>"
    }
    val withStyles = html.substring(0, end) + sheets + html.substring(end)
    val insertion = head.range.last + 1
    return "<!doctype html>\n" + withStyles.substring(0, insertion) +
        "<meta http-equiv=\"Content-Security-Policy\" content=\"$OFFLINE_CONTENT_POLICY\">" + withStyles.substring(insertion)
}
