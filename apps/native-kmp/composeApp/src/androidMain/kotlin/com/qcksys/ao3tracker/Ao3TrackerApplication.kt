package com.qcksys.ao3tracker

import android.app.Application
import com.posthog.kmp.PostHogContext
import com.qcksys.ao3tracker.diagnostics.PostHogCrashReporter
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

        PostHogCrashReporter.initialize(PostHogContext(this))

        // Initialize Napier logging
        if (BuildConfig.DEBUG) {
            Napier.base(DebugAntilog())
        }
    }
}
