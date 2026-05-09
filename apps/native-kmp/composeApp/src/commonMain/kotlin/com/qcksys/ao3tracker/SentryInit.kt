package com.qcksys.ao3tracker

import io.sentry.kotlin.multiplatform.Sentry
import io.sentry.kotlin.multiplatform.SentryLevel

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
    Sentry.init { options ->
        options.dsn = dsn
        options.environment = environment
        options.debug = isDebug
        options.diagnosticLevel = if (isDebug) SentryLevel.DEBUG else SentryLevel.ERROR
        // Don't send PII by default
        options.sendDefaultPii = false
    }
}
