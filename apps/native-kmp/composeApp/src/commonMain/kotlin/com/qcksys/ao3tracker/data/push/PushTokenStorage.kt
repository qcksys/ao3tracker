package com.qcksys.ao3tracker.data.push

/**
 * Platform-specific storage for push notification tokens.
 * - Android: SharedPreferences
 * - iOS: NSUserDefaults
 * - JVM: No-op (desktop doesn't support push)
 */
expect class PushTokenStorage() {
    /**
     * Get the stored FCM/APNs token.
     */
    fun getFcmToken(): String?

    /**
     * Save the FCM/APNs token.
     */
    fun saveFcmToken(token: String)

    /**
     * Clear the stored FCM/APNs token.
     */
    fun clearFcmToken()

    /**
     * Get a unique device identifier for this device.
     * This is used to identify the device when unregistering push tokens.
     */
    fun getDeviceId(): String

    /**
     * Get the platform identifier ("android", "ios", or "desktop").
     */
    fun getPlatform(): String
}

expect fun getPushTokenStorage(): PushTokenStorage
