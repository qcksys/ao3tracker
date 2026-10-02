package com.qcksys.ao3tracker.data.settings

import com.qcksys.ao3tracker.data.push.NotificationPreferences
import com.qcksys.ao3tracker.util.JsonConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ApiEnvironment(
    val authBaseUrl: String,
    val apiBaseUrl: String,
    val displayName: String
) {
    PRODUCTION(
        authBaseUrl = "https://ao3tracker.com/auth",
        apiBaseUrl = "https://ao3tracker.com/api",
        displayName = "Production"
    ),
    DEV(
        authBaseUrl = "https://dev.ao3tracker.com/auth",
        apiBaseUrl = "https://dev.ao3tracker.com/api",
        displayName = "Development"
    ),
    LOCAL(
        authBaseUrl = "https://qcksys-ao3tracker-api-local.ta2.dev/auth",
        apiBaseUrl = "https://qcksys-ao3tracker-api-local.ta2.dev/api",
        displayName = "Local Dev"
    )
}

expect fun defaultApiEnvironment(): ApiEnvironment

class AppSettings(
    private val settingsStorage: SettingsStorage?,
    defaultEnvironment: ApiEnvironment = defaultApiEnvironment()
) {
    private val _apiEnvironment = MutableStateFlow(
        settingsStorage?.getApiEnvironment()?.let { name ->
            ApiEnvironment.entries.find { it.name == name }
        } ?: defaultEnvironment
    )
    val apiEnvironment: StateFlow<ApiEnvironment> = _apiEnvironment.asStateFlow()

    private val _devModeEnabled = MutableStateFlow(settingsStorage?.isDevModeEnabled() ?: false)
    val devModeEnabled: StateFlow<Boolean> = _devModeEnabled.asStateFlow()

    private val _autoSyncOnOpenEnabled = MutableStateFlow(settingsStorage?.isAutoSyncOnOpenEnabled() ?: true)
    val autoSyncOnOpenEnabled: StateFlow<Boolean> = _autoSyncOnOpenEnabled.asStateFlow()

    private val _incognitoModeEnabled = MutableStateFlow(settingsStorage?.isIncognitoModeEnabled() ?: false)
    val incognitoModeEnabled: StateFlow<Boolean> = _incognitoModeEnabled.asStateFlow()
    private val _notificationPreferences = MutableStateFlow(
        settingsStorage?.getNotificationPreferences()?.let {
            JsonConfig.json.decodeFromString<NotificationPreferences>(it)
        } ?: NotificationPreferences()
    )
    val notificationPreferences: StateFlow<NotificationPreferences> = _notificationPreferences.asStateFlow()

    fun setNotificationPreferences(preferences: NotificationPreferences) {
        settingsStorage?.setNotificationPreferences(JsonConfig.json.encodeToString(preferences))
        _notificationPreferences.value = preferences
    }
    private val trackingGeneration = MutableStateFlow(0L)

    private val _browsingPreferences = MutableStateFlow(
        settingsStorage?.getBrowsingPreferences()?.let {
            JsonConfig.json.decodeFromString<BrowsingPreferences>(it)
        } ?: BrowsingPreferences()
    )
    val browsingPreferences: StateFlow<BrowsingPreferences> = _browsingPreferences.asStateFlow()

    private fun setBrowsingPreferences(preferences: BrowsingPreferences) {
        settingsStorage?.setBrowsingPreferences(JsonConfig.json.encodeToString(preferences))
        _browsingPreferences.value = preferences
    }

    fun setHiddenTags(text: String) {
        val tags = text.split(',', '\n').map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { it.lowercase() }
        setBrowsingPreferences(_browsingPreferences.value.copy(hiddenTags = tags))
    }

    fun setWorkHidden(workId: Long, hidden: Boolean) {
        if (workId <= 0) return
        val ids = _browsingPreferences.value.hiddenWorkIds.toMutableSet()
        if (hidden) ids.add(workId) else ids.remove(workId)
        setBrowsingPreferences(_browsingPreferences.value.copy(hiddenWorkIds = ids.toList()))
    }

    fun setIncognitoModeEnabled(enabled: Boolean) {
        if (_incognitoModeEnabled.value == enabled) return
        trackingGeneration.value++
        _incognitoModeEnabled.value = enabled
        settingsStorage?.setIncognitoModeEnabled(enabled)
    }

    fun captureTrackingSession(): Long? = trackingGeneration.value.takeUnless { _incognitoModeEnabled.value }

    fun isTrackingSessionCurrent(session: Long): Boolean =
        !_incognitoModeEnabled.value && session == trackingGeneration.value

    fun setApiEnvironment(environment: ApiEnvironment) {
        _apiEnvironment.value = environment
        settingsStorage?.setApiEnvironment(environment.name)
    }

    fun setDevModeEnabled(enabled: Boolean) {
        _devModeEnabled.value = enabled
        settingsStorage?.setDevModeEnabled(enabled)
    }

    fun setAutoSyncOnOpenEnabled(enabled: Boolean) {
        _autoSyncOnOpenEnabled.value = enabled
        settingsStorage?.setAutoSyncOnOpenEnabled(enabled)
    }

    fun getAuthBaseUrl(): String = _apiEnvironment.value.authBaseUrl

    fun getApiBaseUrl(): String = _apiEnvironment.value.apiBaseUrl
}
