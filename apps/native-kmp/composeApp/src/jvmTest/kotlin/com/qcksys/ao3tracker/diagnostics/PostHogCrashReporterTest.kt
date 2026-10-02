package com.qcksys.ao3tracker.diagnostics

import com.posthog.kmp.PostHogEvent
import com.qcksys.ao3tracker.AppBuildInfo
import com.qcksys.ao3tracker.data.settings.DiagnosticSession
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PostHogCrashReporterTest {
    private val build = AppBuildInfo("0.1.0-dev", "123", "2026-10-02 00:00:00 UTC")

    @Test
    fun usesApiProxyAndSeparateQueuesForEachEnvironment() {
        val dev = crashReportingConfig(DiagnosticSession(0, true, "https://dev.ao3tracker.com/api"), build) { true }
        val prod = crashReportingConfig(DiagnosticSession(0, true, "https://ao3tracker.com/api"), build) { true }
        assertEquals("https://dev.ao3tracker.com/ingest/native", dev.host)
        assertEquals("https://ao3tracker.com/ingest/native", prod.host)
        assertNotEquals(dev.apiKey, prod.apiKey)
        assertTrue(dev.errorTracking?.autoCapture == true)
        assertFalse(dev.captureDeepLinks)
        assertFalse(dev.captureApplicationLifecycleEvents)
        assertEquals(null, dev.sessionRecording)
        assertTrue(crashReportingConfig(DiagnosticSession(0, false, "https://ao3tracker.com/api"), build) { false }.optOut)
    }

    @Test
    fun preservesCrashFramesAndAddsReleaseWithoutReadingOrAccountProperties() {
        val frames = listOf(mapOf("type" to "IllegalStateException", "value" to "test"))
        val event = filterCrashEvent(PostHogEvent("\$exception", "anonymous", mapOf(
            "\$exception_list" to frames,
            "\$exception_level" to "fatal",
            "\$current_url" to "private reading URL",
            "email" to "reader@example.test"
        )), build)
        assertEquals(frames, event.properties["\$exception_list"])
        assertEquals("0.1.0-dev", event.properties["\$app_version"])
        assertEquals("123", event.properties["\$app_build"])
        assertFalse(event.properties.containsKey("\$current_url"))
        assertFalse(event.properties.containsKey("email"))
    }
}
