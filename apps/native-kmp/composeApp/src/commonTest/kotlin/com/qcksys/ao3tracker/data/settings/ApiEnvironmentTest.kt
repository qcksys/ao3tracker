package com.qcksys.ao3tracker.data.settings

import kotlin.test.Test
import kotlin.test.assertEquals

class ApiEnvironmentTest {
    @Test
    fun freshDevInstallUsesDevelopmentForAuthAndSync() {
        val settings = AppSettings(null, ApiEnvironment.DEV, canSelectApiEnvironment = true)
        assertEquals(ApiEnvironment.DEV, settings.apiEnvironment.value)
        assertEquals("https://dev.ao3tracker.com/auth", settings.getAuthBaseUrl())
        assertEquals("https://dev.ao3tracker.com/api", settings.getApiBaseUrl())
    }

    @Test
    fun productionInstallRetainsProductionDefault() {
        val settings = AppSettings(null, ApiEnvironment.PRODUCTION)
        assertEquals("https://ao3tracker.com/auth", settings.getAuthBaseUrl())
        assertEquals("https://ao3tracker.com/api", settings.getApiBaseUrl())
    }

    @Test
    fun explicitSelectionOverridesTheBuildDefault() {
        val settings = AppSettings(null, ApiEnvironment.DEV, canSelectApiEnvironment = true)
        settings.setApiEnvironment(ApiEnvironment.PRODUCTION)
        assertEquals(ApiEnvironment.PRODUCTION, settings.apiEnvironment.value)
        assertEquals("https://ao3tracker.com/api", settings.getApiBaseUrl())
    }
}
