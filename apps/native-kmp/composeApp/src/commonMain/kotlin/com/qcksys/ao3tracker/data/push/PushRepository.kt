package com.qcksys.ao3tracker.data.push

import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.util.AppLogger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Repository for managing push notification token registration.
 * Coordinates between local token storage, auth state, and the push token service.
 */
class PushRepository(
    private val pushTokenService: PushTokenService,
    private val pushTokenStorage: PushTokenStore,
    private val authRepository: AuthRepository,
    private val appSettings: AppSettings
) {
    private val registrationMutex = Mutex()

    suspend fun updateNotificationPreferences(preferences: NotificationPreferences): Result<Unit> =
        registrationMutex.withLock {
            registerToken(preferences).onSuccess { appSettings.setNotificationPreferences(preferences) }
        }
    companion object {
        private const val TAG = "PushRepository"
    }

    /**
     * Registers the current FCM token with the server if:
     * - User is authenticated
     * - A token is stored locally or can be fetched from the platform
     *
     * Should be called:
     * - On app startup when authenticated
     * - After successful sign-in
     * - When FCM token refreshes (via onNewToken callback)
     */
    suspend fun registerTokenIfNeeded(): Result<Unit> = registrationMutex.withLock {
        registerToken(appSettings.notificationPreferences.value)
    }

    private suspend fun registerToken(preferences: NotificationPreferences): Result<Unit> {
        val authState = authRepository.authState.value
        val authToken = (authState as? AuthState.Authenticated)?.token
        if (authToken == null) {
            AppLogger.d("Not registering push token: not authenticated", TAG)
            return Result.success(Unit)
        }

        val environment = appSettings.apiEnvironment.value
        val fcmToken = pushTokenStorage.getFcmToken()
            ?: runCatching { pushTokenStorage.fetchFcmToken() }.getOrElse {
                if (it is CancellationException) throw it
                return Result.failure(it)
            }
        if (fcmToken == null) {
            AppLogger.d("Not registering push token: no FCM token available", TAG)
            return Result.success(Unit)
        }

        if (authRepository.authState.value != authState || appSettings.apiEnvironment.value != environment) {
            return Result.failure(Exception("Account or API environment changed"))
        }

        val platform = pushTokenStorage.getPlatform()
        val deviceId = pushTokenStorage.getDeviceId()

        AppLogger.d("Registering push token for platform=$platform, deviceId=$deviceId", TAG)

        return pushTokenService.registerToken(fcmToken, platform, deviceId, authToken, preferences)
            .onSuccess { AppLogger.d("Push token registered successfully", TAG) }
            .onFailure { AppLogger.e("Failed to register push token", TAG, it) }
    }

    /**
     * Unregisters the device from push notifications.
     * Should be called before signing out.
     */
    suspend fun unregisterToken(isCurrentOperation: () -> Boolean = { true }): Result<Unit> = registrationMutex.withLock {
        if (!isCurrentOperation()) throw CancellationException("Account changed")
        val authState = authRepository.authState.value
        val authToken = (authState as? AuthState.Authenticated)?.token
        if (authToken == null) {
            AppLogger.d("Not unregistering push token: not authenticated", TAG)
            return Result.success(Unit)
        }

        val deviceId = pushTokenStorage.getDeviceId()

        AppLogger.d("Unregistering push token for deviceId=$deviceId", TAG)

        return pushTokenService.unregisterToken(deviceId, authToken)
            .onSuccess {
                AppLogger.d("Push token unregistered successfully", TAG)
            }
            .onFailure { AppLogger.e("Failed to unregister push token", TAG, it) }
    }

    /**
     * Saves a new FCM token to local storage.
     * This is called by the platform-specific FCM service when a token is received or refreshed.
     * After saving, the token will be registered on next app startup or auth event.
     */
    fun saveToken(fcmToken: String) {
        AppLogger.d("Saving FCM token to local storage", TAG)
        pushTokenStorage.saveFcmToken(fcmToken)
    }

    /**
     * Checks if push notifications are available on this platform.
     * Desktop platform returns "desktop" which indicates no push support.
     */
    fun isPushSupported(): Boolean {
        return pushTokenStorage.getPlatform() != "desktop"
    }

    /**
     * Fetches notification history from the server.
     *
     * @param cursor Optional cursor for pagination
     * @param limit Maximum number of notifications to return
     * @return Result containing the notification history response
     */
    suspend fun getNotificationHistory(
        cursor: Int? = null,
        limit: Int = 50
    ): Result<NotificationHistoryResponse> {
        val authState = authRepository.authState.value
        val authToken = (authState as? AuthState.Authenticated)?.token
        if (authToken == null) {
            AppLogger.d("Cannot fetch notification history: not authenticated", TAG)
            return Result.failure(Exception("Not authenticated"))
        }

        return pushTokenService.getNotificationHistory(authToken, cursor, limit)
    }
}
