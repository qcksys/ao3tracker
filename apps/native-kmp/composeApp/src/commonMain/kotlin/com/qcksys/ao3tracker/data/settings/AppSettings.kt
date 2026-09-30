package com.qcksys.ao3tracker.data.settings

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

class AppSettings(
    private val settingsStorage: SettingsStorage?
) {
    private val _apiEnvironment = MutableStateFlow(
        settingsStorage?.getApiEnvironment()?.let { name ->
            ApiEnvironment.entries.find { it.name == name }
        } ?: ApiEnvironment.PRODUCTION
    )
    val apiEnvironment: StateFlow<ApiEnvironment> = _apiEnvironment.asStateFlow()

    private val _devModeEnabled = MutableStateFlow(settingsStorage?.isDevModeEnabled() ?: false)
    val devModeEnabled: StateFlow<Boolean> = _devModeEnabled.asStateFlow()

    private val _autoSyncOnOpenEnabled = MutableStateFlow(settingsStorage?.isAutoSyncOnOpenEnabled() ?: true)
    val autoSyncOnOpenEnabled: StateFlow<Boolean> = _autoSyncOnOpenEnabled.asStateFlow()

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
