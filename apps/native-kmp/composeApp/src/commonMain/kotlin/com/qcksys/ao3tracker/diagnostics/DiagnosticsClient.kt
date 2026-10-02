package com.qcksys.ao3tracker.diagnostics

import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.DiagnosticSession
import com.qcksys.ao3tracker.util.JsonConfig
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonPrimitive
import kotlin.uuid.Uuid

@Serializable
data class DiagnosticRequest(val sessionId: String, val platform: String, val data: JsonObject)

class DiagnosticsClient(
    private val settings: AppSettings,
    private val platform: String,
    private val send: suspend (String, DiagnosticRequest) -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
) {
    private data class Pending(val session: DiagnosticSession, val data: JsonObject)
    private val pending = Channel<Pending>(64, BufferOverflow.DROP_OLDEST)

    init {
        scope.launch {
            settings.diagnosticSession.collectLatest { session ->
                val sessionId = Uuid.random().toString()
                for (item in pending) {
                    if (item.session != session || settings.captureDiagnosticSession() != session) continue
                    try {
                        send(
                            session.apiBaseUrl.removeSuffix("/api") + "/ingest",
                            DiagnosticRequest(sessionId, platform, item.data)
                        )
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        // Diagnostics are best-effort and must never interrupt reading or recursively log failures.
                    }
                }
            }
        }
    }

    fun capture(event: String, property: Pair<String, String>? = null) {
        enqueue(buildJsonObject {
            put("event", event)
            property?.let { (key, value) -> put(key, value) }
        })
    }

    fun captureLog(level: String, component: String) {
        enqueue(buildJsonObject {
            put("event", "diagnostic_log")
            put("level", level)
            put("component", component)
        })
    }

    private fun enqueue(data: JsonObject) {
        val generation = settings.captureDiagnosticSession() ?: return
        pending.trySend(Pending(generation, data))
    }

    fun close() {
        pending.cancel()
        scope.cancel()
    }
}

object Diagnostics {
    private val client = MutableStateFlow<DiagnosticsClient?>(null)

    fun install(value: DiagnosticsClient) { client.value = value }
    fun uninstall(value: DiagnosticsClient) { client.compareAndSet(value, null) }
    fun capture(event: String, property: Pair<String, String>? = null) { client.value?.capture(event, property) }

    fun log(level: String, tag: String) {
        val component = when {
            tag.contains("Auth") || tag.contains("Credential") -> "auth"
            tag.contains("Sync") -> "sync"
            tag.contains("Read") || tag.contains("WebView") -> "reader"
            tag.contains("Push") || tag.contains("Notification") -> "push"
            tag.contains("Storage") || tag.contains("Database") -> "storage"
            else -> "app"
        }
        client.value?.captureLog(level, component)
    }

    fun captureWebView(data: JsonObject) {
        when (data["event"]?.jsonPrimitive?.content) {
            "webview_ready" -> capture("webview_ready")
            "webview_error" -> data["kind"]?.jsonPrimitive?.content?.takeIf {
                it in setOf("script", "promise")
            }?.let { capture("webview_error", "kind" to it) }
            "webview_action" -> data["action"]?.jsonPrimitive?.content?.takeIf {
                it in setOf("save_search", "hide_work", "show_work")
            }?.let { capture("webview_action", "action" to it) }
        }
    }

}

class DiagnosticsTransport {
    private val client = HttpClient {
        followRedirects = false
        install(HttpTimeout) { requestTimeoutMillis = 5000 }
    }

    suspend fun send(url: String, request: DiagnosticRequest) {
        client.post(url) {
            contentType(ContentType.Application.Json)
            setBody(JsonConfig.json.encodeToString(request))
        }
    }

    fun close() { client.close() }
}
