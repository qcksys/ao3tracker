package com.qcksys.ao3tracker.webview

/**
 * Provides the AO3 tracking script for WebView injection.
 * The script is compiled from TypeScript source at build time.
 *
 * Source: webview-scripts/src/ao3-tracking.ts
 * Generated: build/generated/kotlin/webview/Ao3TrackingScriptGenerated.kt
 */
object Ao3TrackingScript {
    val script: String
        get() = Ao3TrackingScriptGenerated.script
}
