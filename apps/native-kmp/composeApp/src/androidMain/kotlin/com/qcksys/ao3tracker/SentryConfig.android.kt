package com.qcksys.ao3tracker

actual object SentryConfig {
    actual val dsn: String = BuildConfig.SENTRY_DSN
    actual val isDebug: Boolean = BuildConfig.DEBUG
}
