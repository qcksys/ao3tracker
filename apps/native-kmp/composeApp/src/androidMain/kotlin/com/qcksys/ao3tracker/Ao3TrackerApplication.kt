package com.qcksys.ao3tracker

import android.app.Application
import io.github.aakira.napier.DebugAntilog
import io.github.aakira.napier.Napier

class Ao3TrackerApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialize Sentry error tracking (before other init to catch early errors)
        initializeSentry(
            dsn = SentryConfig.dsn,
            isDebug = SentryConfig.isDebug,
            environment = if (BuildConfig.DEBUG) "development" else "production"
        )

        // Initialize Napier logging
        if (BuildConfig.DEBUG) {
            Napier.base(DebugAntilog())
        }
    }
}
 