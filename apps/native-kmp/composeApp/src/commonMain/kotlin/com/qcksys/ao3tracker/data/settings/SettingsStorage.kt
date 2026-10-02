package com.qcksys.ao3tracker.data.settings

expect class SettingsStorage() {
    fun getApiEnvironment(): String?
    fun setApiEnvironment(environment: String)
    fun isDevModeEnabled(): Boolean
    fun setDevModeEnabled(enabled: Boolean)
    fun getLastSyncTimestamp(): String?
    fun setLastSyncTimestamp(timestamp: String?)
    fun isAutoSyncOnOpenEnabled(): Boolean
    fun setAutoSyncOnOpenEnabled(enabled: Boolean)
    fun isIncognitoModeEnabled(): Boolean
    fun setIncognitoModeEnabled(enabled: Boolean)
    fun isDiagnosticDataEnabled(): Boolean
    fun setDiagnosticDataEnabled(enabled: Boolean)
    fun getNotificationPreferences(): String?
    fun setNotificationPreferences(preferences: String)
    fun getBrowsingPreferences(): String?
    fun setBrowsingPreferences(preferences: String)
}

expect fun getSettingsStorage(): SettingsStorage
