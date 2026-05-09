package com.qcksys.ao3tracker

/**
 * Platform-specific Sentry configuration.
 */
expect object SentryConfig {
    /**
     * The Sentry DSN for this platform.
     */
    val dsn: String

    /**
     * Whether the app is in debug mode.
     */
    val isDebug: Boolean
}
