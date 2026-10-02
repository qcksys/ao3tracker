package com.qcksys.ao3tracker.data.settings

import com.qcksys.ao3tracker.BuildConfig

actual fun defaultApiEnvironment(): ApiEnvironment = ApiEnvironment.valueOf(BuildConfig.API_ENVIRONMENT)
