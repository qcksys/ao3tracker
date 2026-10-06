package com.qcksys.ao3tracker

import android.app.Application
import com.posthog.kmp.PostHogContext
import com.qcksys.ao3tracker.diagnostics.PostHogCrashReporter
import com.qcksys.ao3tracker.data.push.initializePushTokenStorage
import com.qcksys.ao3tracker.data.settings.initializeSettingsStorage
import com.qcksys.ao3tracker.data.offline.initializeOfflineFiles
import com.qcksys.ao3tracker.data.offline.initializeOfflineNetwork
import com.qcksys.ao3tracker.push.Ao3FirebaseMessagingService
import io.github.aakira.napier.DebugAntilog
import io.github.aakira.napier.Napier

open class Ao3TrackerApplication : Application() {
    protected open val configuration = AndroidAppConfiguration()

    override fun onCreate() {
        super.onCreate()

        initializeAndroidAppConfiguration(configuration)

        initializePushTokenStorage(this)
        initializeSettingsStorage(this)
        initializeOfflineFiles(this)
        initializeOfflineNetwork(this)
        Ao3FirebaseMessagingService.createNotificationChannel(this)

        PostHogCrashReporter.initialize(PostHogContext(this))

        // Initialize Napier logging
        if (configuration.debug) {
            Napier.base(DebugAntilog())
        }
    }
}
