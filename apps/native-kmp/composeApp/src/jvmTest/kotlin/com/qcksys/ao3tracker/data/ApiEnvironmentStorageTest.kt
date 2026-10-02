package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.settings.ApiEnvironment
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.SettingsStorage
import java.util.prefs.Preferences
import kotlin.test.Test
import kotlin.test.assertEquals

class ApiEnvironmentStorageTest {
    @Test
    fun productionIgnoresSavedServerWhileDevelopmentKeepsIt() {
        val storage = SettingsStorage()
        val previous = storage.getApiEnvironment()
        try {
            storage.setApiEnvironment(ApiEnvironment.LOCAL.name)
            val production = AppSettings(storage, ApiEnvironment.PRODUCTION, canSelectApiEnvironment = false)
            assertEquals(ApiEnvironment.PRODUCTION, production.apiEnvironment.value)
            production.setApiEnvironment(ApiEnvironment.DEV)
            assertEquals(ApiEnvironment.PRODUCTION, production.apiEnvironment.value)
            assertEquals(ApiEnvironment.LOCAL.name, storage.getApiEnvironment())

            val development = AppSettings(storage, ApiEnvironment.DEV, canSelectApiEnvironment = true)
            assertEquals(ApiEnvironment.LOCAL, development.apiEnvironment.value)
            development.setApiEnvironment(ApiEnvironment.DEV)
            assertEquals(ApiEnvironment.DEV.name, storage.getApiEnvironment())
        } finally {
            if (previous == null) Preferences.userNodeForPackage(SettingsStorage::class.java).remove("api_environment")
            else storage.setApiEnvironment(previous)
        }
    }
}
