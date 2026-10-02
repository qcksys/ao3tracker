package com.qcksys.ao3tracker

actual fun appBuildInfo(): AppBuildInfo = AppBuildInfo(
    version = GeneratedAppBuildInfo.desktopVersion
)
