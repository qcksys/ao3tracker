package com.qcksys.ao3tracker

import com.qcksys.ao3tracker.data.settings.ApiEnvironment

class AndroidApplication : Ao3TrackerApplication() {
    override val configuration: AndroidAppConfiguration
        get() = buildConfiguration()
}

internal fun buildConfiguration() = AndroidAppConfiguration(
    versionName = BuildConfig.VERSION_NAME,
    versionCode = BuildConfig.VERSION_CODE,
    debug = BuildConfig.DEBUG,
    apiEnvironment = ApiEnvironment.valueOf(BuildConfig.API_ENVIRONMENT),
    apiEnvironmentSelectionEnabled = BuildConfig.API_ENVIRONMENT_SELECTION_ENABLED
)
