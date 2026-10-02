package com.qcksys.ao3tracker

import io.sentry.kotlin.multiplatform.Sentry
import io.sentry.kotlin.multiplatform.SentryLevel
import com.qcksys.ao3tracker.data.settings.getSettingsStorage
import kotlinx.coroutines.flow.MutableStateFlow

private val diagnosticConsent = MutableStateFlow(false)
private var startSentry: (() -> Unit)? = null

fun setSentryDiagnosticDataEnabled(enabled: Boolean) {
    diagnosticConsent.value = enabled
    if (enabled) startSentry?.invoke() else Sentry.close()
}

/**
 * Initializes Sentry error tracking for the application.
 *
 * @param dsn The Sentry DSN (Data Source Name). Can point to a proxy endpoint.
 * @param isDebug Whether the app is running in debug mode.
 * @param environment The deployment environment (e.g., "production", "development").
 */
fun initializeSentry(
    dsn: String,
    isDebug: Boolean = false,
    environment: String = "production"
) {
    startSentry = { Sentry.init { options ->
        options.dsn = dsn
        options.environment = environment
        options.debug = isDebug
        options.diagnosticLevel = if (isDebug) SentryLevel.DEBUG else SentryLevel.ERROR
        // Don't send PII by default
        options.sendDefaultPii = false
        options.enableAutoSessionTracking = false
        options.enableCaptureFailedRequests = false
        options.beforeSend = { event -> event.takeIf { diagnosticConsent.value } }
    } }
    setSentryDiagnosticDataEnabled(getSettingsStorage().isDiagnosticDataEnabled())
}
