package com.qcksys.ao3tracker

import com.qcksys.ao3tracker.data.settings.ApiEnvironment

data class AndroidAppConfiguration(
    val versionName: String = "unknown",
    val versionCode: Int = 0,
    val debug: Boolean = false,
    val apiEnvironment: ApiEnvironment = ApiEnvironment.PRODUCTION,
    val apiEnvironmentSelectionEnabled: Boolean = false
)

internal var androidAppConfiguration = AndroidAppConfiguration()
    private set

fun initializeAndroidAppConfiguration(configuration: AndroidAppConfiguration) {
    androidAppConfiguration = configuration
}
