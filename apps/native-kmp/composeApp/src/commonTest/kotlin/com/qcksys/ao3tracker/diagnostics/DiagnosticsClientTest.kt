package com.qcksys.ao3tracker.diagnostics

import com.qcksys.ao3tracker.data.settings.ApiEnvironment
import com.qcksys.ao3tracker.data.settings.AppSettings
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class DiagnosticsClientTest {
    @Test
    fun optOutDropsQueuedEventsAndCancelsInFlightSend() = runTest {
        val settings = AppSettings(null)
        val sent = mutableListOf<DiagnosticRequest>()
        var cancelled = false
        var block = true
        val client = DiagnosticsClient(settings, "android", { _, request ->
            sent.add(request)
            if (block) try { awaitCancellation() } finally { cancelled = true }
        }, backgroundScope)
        runCurrent()
        client.capture("app_opened")
        runCurrent()
        client.capture("webview_ready")
        settings.setDiagnosticDataEnabled(false)
        client.capture("screen_viewed", "screen" to "settings")
        runCurrent()
        assertTrue(cancelled)
        assertEquals(1, sent.size)
        block = false
        settings.setDiagnosticDataEnabled(true)
        runCurrent()
        client.capture("screen_viewed", "screen" to "works")
        runCurrent()
        assertEquals(2, sent.size)
        assertNotEquals(sent[0].sessionId, sent[1].sessionId)
        client.close()
    }

    @Test
    fun startsOptedOutAndDoesNotReplayIncognitoEvents() = runTest {
        val settings = AppSettings(null)
        settings.setDiagnosticDataEnabled(false)
        val sent = mutableListOf<DiagnosticRequest>()
        val client = DiagnosticsClient(settings, "ios", { _, request -> sent.add(request) }, backgroundScope)
        client.capture("app_opened")
        runCurrent()
        assertTrue(sent.isEmpty())
        settings.setDiagnosticDataEnabled(true)
        settings.setIncognitoModeEnabled(true)
        client.capture("webview_ready")
        runCurrent()
        settings.setIncognitoModeEnabled(false)
        runCurrent()
        assertTrue(sent.isEmpty())
        client.capture("webview_ready")
        runCurrent()
        assertEquals(1, sent.size)
        client.close()
    }

    @Test
    fun environmentChangeDropsOldEventsAndUsesNewAnonymousSession() = runTest {
        val settings = AppSettings(null, ApiEnvironment.DEV, canSelectApiEnvironment = true)
        val sent = mutableListOf<Pair<String, DiagnosticRequest>>()
        val client = DiagnosticsClient(settings, "desktop", { url, request -> sent.add(url to request) }, backgroundScope)
        runCurrent()
        client.capture("app_opened")
        runCurrent()
        client.capture("webview_ready")
        settings.setApiEnvironment(ApiEnvironment.PRODUCTION)
        runCurrent()
        client.capture("app_opened")
        runCurrent()
        assertEquals(listOf("https://dev.ao3tracker.com/ingest", "https://ao3tracker.com/ingest"), sent.map { it.first })
        assertNotEquals(sent[0].second.sessionId, sent[1].second.sessionId)
        client.close()
    }

    @Test
    fun webViewCannotForwardPrivateTextOrArbitraryEvents() = runTest {
        val sent = mutableListOf<DiagnosticRequest>()
        val client = DiagnosticsClient(AppSettings(null), "android", { _, request -> sent.add(request) }, backgroundScope)
        Diagnostics.install(client)
        try {
            runCurrent()
            Diagnostics.captureWebView(buildJsonObject {
                put("event", "webview_error")
                put("kind", "script")
                put("message", "private reading content")
            })
            Diagnostics.captureWebView(buildJsonObject { put("event", "arbitrary") })
            Diagnostics.captureWebView(buildJsonObject { put("event", "webview_action"); put("action", "private search") })
            runCurrent()
            assertEquals(1, sent.size)
            assertEquals(buildJsonObject { put("event", "webview_error"); put("kind", "script") }, sent.single().data)
        } finally {
            Diagnostics.uninstall(client)
            client.close()
        }
    }

    @Test
    fun failedSendDoesNotStopFutureEvents() = runTest {
        var attempts = 0
        val client = DiagnosticsClient(AppSettings(null), "android", { _, _ ->
            attempts++
            if (attempts == 1) error("offline")
        }, backgroundScope)
        runCurrent()
        client.capture("app_opened")
        client.capture("webview_ready")
        runCurrent()
        assertEquals(2, attempts)
        client.close()
    }
}
