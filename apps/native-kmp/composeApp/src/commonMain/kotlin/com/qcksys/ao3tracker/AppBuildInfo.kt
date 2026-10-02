package com.qcksys.ao3tracker

data class AppBuildInfo(
    val version: String,
    val buildNumber: String? = null,
    val buildTimeUtc: String = GeneratedAppBuildInfo.buildTimeUtc
)

expect fun appBuildInfo(): AppBuildInfo
