package com.qcksys.ao3tracker.data.settings

import kotlin.experimental.ExperimentalNativeApi
import kotlin.native.Platform

@OptIn(ExperimentalNativeApi::class)
actual fun supportsApiEnvironmentSelection(): Boolean = Platform.isDebugBinary
