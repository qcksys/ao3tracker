package com.qcksys.ao3tracker

actual fun appBuildInfo(): AppBuildInfo = AppBuildInfo(
    version = BuildConfig.VERSION_NAME,
    buildNumber = BuildConfig.VERSION_CODE.toString()
)
