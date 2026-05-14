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

    actual fun getFavouriteTagFilters(): Set<String> {
        val raw = prefs.get(KEY_FAVOURITE_TAG_FILTERS, "") ?: ""
        return if (raw.isEmpty()) emptySet() else raw.split('\n').toSet()
    }

    actual fun setFavouriteTagFilters(filters: Set<String>) {
        prefs.put(KEY_FAVOURITE_TAG_FILTERS, filters.joinToString("\n"))
    }

    companion object {
        private const val KEY_API_ENVIRONMENT = "api_environment"
        private const val KEY_DEV_MODE = "dev_mode_enabled"
        private const val KEY_LAST_SYNC_TIMESTAMP = "last_sync_timestamp"
        private const val KEY_AUTO_SYNC_ON_OPEN = "auto_sync_on_open"
        private const val KEY_FAVOURITE_TAG_FILTERS = "favourite_tag_filters"
    }
}
