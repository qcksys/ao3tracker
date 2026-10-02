package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.push.NotificationPreferences
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.SettingsStorage
import java.util.prefs.Preferences
import kotlin.test.Test
import kotlin.test.assertEquals

class NotificationSettingsStorageTest {
    @Test
    fun preferencesSurviveRestartAndMasterToggle() {
        val storage = SettingsStorage()
        val previous = storage.getNotificationPreferences()
        try {
            val preferences = NotificationPreferences(enabled = false, newChapters = false, workDeleted = false)
            AppSettings(storage).setNotificationPreferences(preferences)
            val restarted = AppSettings(SettingsStorage())
            assertEquals(preferences, restarted.notificationPreferences.value)
            restarted.setNotificationPreferences(preferences.copy(enabled = true))
            assertEquals(preferences.copy(enabled = true), AppSettings(SettingsStorage()).notificationPreferences.value)
        } finally {
            if (previous == null) {
                Preferences.userNodeForPackage(SettingsStorage::class.java).remove("notification_preferences")
            } else {
                storage.setNotificationPreferences(previous)
            }
        }
    }
}
