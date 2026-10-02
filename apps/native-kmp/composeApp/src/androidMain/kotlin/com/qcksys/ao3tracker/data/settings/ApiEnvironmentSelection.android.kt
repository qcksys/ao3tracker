package com.qcksys.ao3tracker.data.settings

import com.qcksys.ao3tracker.BuildConfig

actual fun supportsApiEnvironmentSelection(): Boolean = BuildConfig.API_ENVIRONMENT_SELECTION_ENABLED
