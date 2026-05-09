package com.qcksys.ao3tracker

actual object SentryConfig {
    // Read from environment variable or use default
    actual val dsn: String = System.getenv("SENTRY_DSN")
        ?: "https://12e1b1b6f3402ab88188b7508dd5f65c@o4507101986291712.ingest.de.sentry.io/4510465375993936"
    actual val isDebug: Boolean = System.getProperty("debug")?.toBoolean() ?: false
}
