package com.qcksys.ao3tracker

actual fun appBuildInfo(): AppBuildInfo = AppBuildInfo(
    version = androidAppConfiguration.versionName,
    buildNumber = androidAppConfiguration.versionCode.toString()
)
