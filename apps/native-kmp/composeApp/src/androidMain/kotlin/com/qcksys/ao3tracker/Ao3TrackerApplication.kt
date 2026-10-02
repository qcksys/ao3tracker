package com.qcksys.ao3tracker

import android.app.Application
import com.qcksys.ao3tracker.data.push.initializePushTokenStorage
import com.qcksys.ao3tracker.data.settings.initializeSettingsStorage
import com.qcksys.ao3tracker.push.Ao3FirebaseMessagingService
import io.github.aakira.napier.DebugAntilog
import io.github.aakira.napier.Napier

class Ao3TrackerApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        initializePushTokenStorage(this)
        initializeSettingsStorage(this)
        Ao3FirebaseMessagingService.createNotificationChannel(this)

        // Initialize Sentry error tracking (before other init to catch early errors)
        initializeSentry(
            dsn = SentryConfig.dsn,
            isDebug = SentryConfig.isDebug,
            environment = if (BuildConfig.DEBUG || BuildConfig.API_ENVIRONMENT == "DEV") "development" else "production"
        )

        // Initialize Napier logging
        if (BuildConfig.DEBUG) {
            Napier.base(DebugAntilog())
        }
    }
}
