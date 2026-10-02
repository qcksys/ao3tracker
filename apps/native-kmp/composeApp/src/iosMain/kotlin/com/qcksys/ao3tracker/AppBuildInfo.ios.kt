package com.qcksys.ao3tracker

import platform.Foundation.NSBundle

actual fun appBuildInfo(): AppBuildInfo = AppBuildInfo(
    version = NSBundle.mainBundle.objectForInfoDictionaryKey("CFBundleShortVersionString") as? String ?: "Unknown",
    buildNumber = NSBundle.mainBundle.objectForInfoDictionaryKey("CFBundleVersion") as? String
)
