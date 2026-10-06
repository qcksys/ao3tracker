package com.qcksys.ao3tracker.data.settings

import com.qcksys.ao3tracker.androidAppConfiguration

actual fun supportsApiEnvironmentSelection(): Boolean = androidAppConfiguration.apiEnvironmentSelectionEnabled
