package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.BrowsingPreferences
import com.qcksys.ao3tracker.data.settings.SettingsStorage
import java.util.prefs.Preferences
import kotlin.test.Test
import kotlin.test.assertEquals

class BrowsingSettingsStorageTest {
    @Test
    fun hiddenWorksAndTagsPersistAndCanBeRemoved() {
        val storage = SettingsStorage()
        val previous = storage.getBrowsingPreferences()
        try {
            storage.setBrowsingPreferences("{}")
            val settings = AppSettings(storage)
            assertEquals(BrowsingPreferences(), settings.browsingPreferences.value)
            settings.setHiddenTags(" Angst \nFluff, angst, ")
            settings.setWorkHidden(123, true)
            settings.setWorkHidden(123, true)
            settings.setWorkHidden(-1, true)
            val restarted = AppSettings(SettingsStorage())
            assertEquals(BrowsingPreferences(listOf(123), listOf("Angst", "Fluff")), restarted.browsingPreferences.value)
            restarted.setWorkHidden(123, false)
            restarted.setHiddenTags("")
            assertEquals(BrowsingPreferences(), AppSettings(SettingsStorage()).browsingPreferences.value)
        } finally {
            if (previous == null) Preferences.userNodeForPackage(SettingsStorage::class.java).remove("browsing_preferences")
            else storage.setBrowsingPreferences(previous)
        }
    }
}
