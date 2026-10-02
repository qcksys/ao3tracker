package com.qcksys.ao3tracker.data.settings

import kotlin.test.Test
import kotlin.test.assertEquals

class ProductionApiEnvironmentTest {
    @Test
    fun cannotSwitchServersEvenWithDevModeEnabled() {
        val settings = AppSettings(null, ApiEnvironment.PRODUCTION, canSelectApiEnvironment = false)
        settings.setDevModeEnabled(true)
        settings.setApiEnvironment(ApiEnvironment.DEV)
        assertEquals(ApiEnvironment.PRODUCTION, settings.apiEnvironment.value)
        assertEquals("https://ao3tracker.com/auth", settings.getAuthBaseUrl())
        assertEquals("https://ao3tracker.com/api", settings.getApiBaseUrl())
    }
}
