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
    /** Favourite tag filters, encoded as "typeId\ttag" entries (tab-separated). */
    fun getFavouriteTagFilters(): Set<String>
    fun setFavouriteTagFilters(filters: Set<String>)
}

expect fun getSettingsStorage(): SettingsStorage
