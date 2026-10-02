package com.qcksys.ao3tracker.data.settings

import java.util.prefs.Preferences

actual fun getSettingsStorage(): SettingsStorage = SettingsStorage()

actual class SettingsStorage {
    private val prefs: Preferences = Preferences.userNodeForPackage(SettingsStorage::class.java)

    actual fun getApiEnvironment(): String? {
        return prefs.get(KEY_API_ENVIRONMENT, null)
    }

    actual fun setApiEnvironment(environment: String) {
        prefs.put(KEY_API_ENVIRONMENT, environment)
    }

    actual fun isDevModeEnabled(): Boolean {
        return prefs.getBoolean(KEY_DEV_MODE, false)
    }

    actual fun setDevModeEnabled(enabled: Boolean) {
        prefs.putBoolean(KEY_DEV_MODE, enabled)
    }

    actual fun getLastSyncTimestamp(): String? {
        return prefs.get(KEY_LAST_SYNC_TIMESTAMP, null)
    }

    actual fun setLastSyncTimestamp(timestamp: String?) {
        if (timestamp != null) {
            prefs.put(KEY_LAST_SYNC_TIMESTAMP, timestamp)
        } else {
            prefs.remove(KEY_LAST_SYNC_TIMESTAMP)
        }
    }

    actual fun isAutoSyncOnOpenEnabled(): Boolean {
        return prefs.getBoolean(KEY_AUTO_SYNC_ON_OPEN, true)
    }

    actual fun setAutoSyncOnOpenEnabled(enabled: Boolean) {
        prefs.putBoolean(KEY_AUTO_SYNC_ON_OPEN, enabled)
    }

    actual fun isIncognitoModeEnabled(): Boolean = prefs.getBoolean(KEY_INCOGNITO_MODE, false)

    actual fun setIncognitoModeEnabled(enabled: Boolean) {
        prefs.putBoolean(KEY_INCOGNITO_MODE, enabled)
    }

    actual fun getNotificationPreferences(): String? = prefs.get("notification_preferences", null)
    actual fun isDiagnosticDataEnabled(): Boolean = prefs.getBoolean("diagnostic_data_enabled", true)

    actual fun setDiagnosticDataEnabled(enabled: Boolean) {
        prefs.putBoolean("diagnostic_data_enabled", enabled)
        prefs.flush()
    }

    actual fun getBrowsingPreferences(): String? = prefs.get("browsing_preferences", null)

    actual fun setBrowsingPreferences(preferences: String) {
        prefs.put("browsing_preferences", preferences)
    }

    actual fun setNotificationPreferences(preferences: String) {
        prefs.put("notification_preferences", preferences)
    }

    companion object {
        private const val KEY_API_ENVIRONMENT = "api_environment"
        private const val KEY_DEV_MODE = "dev_mode_enabled"
        private const val KEY_LAST_SYNC_TIMESTAMP = "last_sync_timestamp"
        private const val KEY_AUTO_SYNC_ON_OPEN = "auto_sync_on_open"
        private const val KEY_INCOGNITO_MODE = "incognito_mode_enabled"
    }
}
