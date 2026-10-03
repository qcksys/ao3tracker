package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.OfflinePreferences
import com.qcksys.ao3tracker.data.settings.SettingsStorage
import java.util.prefs.Preferences
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class OfflineSettingsStorageTest {
    @Test
    fun `automatic downloads require opt in and the choice survives restart`() {
        val storage = SettingsStorage()
        val previous = storage.getOfflinePreferences()
        val preferences = Preferences.userNodeForPackage(SettingsStorage::class.java)
        try {
            preferences.remove("offline_preferences")
            assertFalse(AppSettings(SettingsStorage()).offlinePreferences.value.automatic)
            for (value in listOf("{}", "invalid json")) {
                storage.setOfflinePreferences(value)
                assertFalse(AppSettings(SettingsStorage()).offlinePreferences.value.automatic)
            }
            val settings = AppSettings(storage)
            settings.setOfflinePreferences(OfflinePreferences(automatic = true, wifiOnly = false))
            assertEquals(OfflinePreferences(automatic = true, wifiOnly = false), AppSettings(SettingsStorage()).offlinePreferences.value)
            settings.setOfflinePreferences(OfflinePreferences())
            assertEquals(OfflinePreferences(automatic = false, wifiOnly = true), AppSettings(SettingsStorage()).offlinePreferences.value)
        } finally {
            if (previous == null) preferences.remove("offline_preferences") else storage.setOfflinePreferences(previous)
        }
    }
}
