package com.qcksys.ao3tracker.data.push

import com.qcksys.ao3tracker.util.JsonConfig
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NotificationPreferencesTest {
    @Test
    fun defaultsAndStoredPreferencesRoundTrip() {
        assertEquals(NotificationPreferences(), JsonConfig.json.decodeFromString<NotificationPreferences>("{}"))
        val preferences = NotificationPreferences(newChapters = false, workDeleted = false)
        val stored = JsonConfig.json.encodeToString(preferences)
        assertEquals(preferences, JsonConfig.json.decodeFromString<NotificationPreferences>(stored))
        assertTrue(stored.contains("\"new_chapters\":false"))
        assertTrue(stored.contains("\"work_deleted\":false"))
        val request = PushTokenRequest("token", "android", "device", preferences)
        assertTrue(JsonConfig.json.encodeToString(request).contains("\"notificationPreferences\""))
    }

    @Test
    fun categoryChoicesSurviveDisablingAllNotifications() {
        val preferences = NotificationPreferences(newChapters = false, workRestricted = false)
        assertFalse(preferences.allows("new_chapters"))
        assertTrue(preferences.allows("work_completed"))
        assertFalse(preferences.allows("work_restricted"))
        assertTrue(preferences.allows("work_deleted"))
        for (type in NotificationType.entries) {
            assertFalse(preferences.copy(enabled = false).allows(type.name))
        }
        assertEquals(preferences, preferences.copy(enabled = false).copy(enabled = true))
    }
}
