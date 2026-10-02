package com.qcksys.ao3tracker.data.settings

import platform.Foundation.NSUserDefaults

actual fun getSettingsStorage(): SettingsStorage = SettingsStorage()

actual class SettingsStorage {
    private val userDefaults = NSUserDefaults.standardUserDefaults

    actual fun getApiEnvironment(): String? {
        return userDefaults.stringForKey(KEY_API_ENVIRONMENT)
    }

    actual fun setApiEnvironment(environment: String) {
        userDefaults.setObject(environment, KEY_API_ENVIRONMENT)
    }

    actual fun isDevModeEnabled(): Boolean {
        return userDefaults.boolForKey(KEY_DEV_MODE)
    }

    actual fun setDevModeEnabled(enabled: Boolean) {
        userDefaults.setBool(enabled, KEY_DEV_MODE)
    }

    actual fun getLastSyncTimestamp(): String? {
        return userDefaults.stringForKey(KEY_LAST_SYNC_TIMESTAMP)
    }

    actual fun setLastSyncTimestamp(timestamp: String?) {
        if (timestamp != null) {
            userDefaults.setObject(timestamp, KEY_LAST_SYNC_TIMESTAMP)
        } else {
            userDefaults.removeObjectForKey(KEY_LAST_SYNC_TIMESTAMP)
        }
    }

    actual fun isAutoSyncOnOpenEnabled(): Boolean {
        // Default to true if not set
        return if (userDefaults.objectForKey(KEY_AUTO_SYNC_ON_OPEN) == null) {
            true
        } else {
            userDefaults.boolForKey(KEY_AUTO_SYNC_ON_OPEN)
        }
    }

    actual fun setAutoSyncOnOpenEnabled(enabled: Boolean) {
        userDefaults.setBool(enabled, KEY_AUTO_SYNC_ON_OPEN)
    }

    actual fun isIncognitoModeEnabled(): Boolean = userDefaults.boolForKey(KEY_INCOGNITO_MODE)

    actual fun setIncognitoModeEnabled(enabled: Boolean) {
        userDefaults.setBool(enabled, KEY_INCOGNITO_MODE)
    }

    actual fun getNotificationPreferences(): String? = userDefaults.stringForKey("notification_preferences")

    actual fun getBrowsingPreferences(): String? = userDefaults.stringForKey("browsing_preferences")

    actual fun setBrowsingPreferences(preferences: String) {
        userDefaults.setObject(preferences, "browsing_preferences")
    }

    actual fun setNotificationPreferences(preferences: String) {
        userDefaults.setObject(preferences, "notification_preferences")
    }

    companion object {
        private const val KEY_API_ENVIRONMENT = "api_environment"
        private const val KEY_DEV_MODE = "dev_mode_enabled"
        private const val KEY_LAST_SYNC_TIMESTAMP = "last_sync_timestamp"
        private const val KEY_AUTO_SYNC_ON_OPEN = "auto_sync_on_open"
        private const val KEY_INCOGNITO_MODE = "incognito_mode_enabled"
    }
}
