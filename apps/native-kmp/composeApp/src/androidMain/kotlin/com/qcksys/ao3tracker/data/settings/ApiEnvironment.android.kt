package com.qcksys.ao3tracker.data.settings

import com.qcksys.ao3tracker.androidAppConfiguration

actual fun defaultApiEnvironment(): ApiEnvironment = androidAppConfiguration.apiEnvironment
