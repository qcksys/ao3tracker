package com.qcksys.ao3tracker.data.push

/**
 * Platform-specific storage for push notification tokens.
 * - Android: SharedPreferences
 * - iOS: NSUserDefaults
 * - JVM: No-op (desktop doesn't support push)
 */
interface PushTokenStore {
    fun getFcmToken(): String?
    suspend fun fetchFcmToken(): String? = getFcmToken()
    fun saveFcmToken(token: String)
    fun clearFcmToken()
    fun getDeviceId(): String
    fun getPlatform(): String
}

expect class PushTokenStorage() : PushTokenStore {
    /**
     * Get the stored FCM/APNs token.
     */
    override fun getFcmToken(): String?

    /**
     * Save the FCM/APNs token.
     */
    override fun saveFcmToken(token: String)

    /**
     * Clear the stored FCM/APNs token.
     */
    override fun clearFcmToken()

    /**
     * Get a unique device identifier for this device.
     * This is used to identify the device when unregistering push tokens.
     */
    override fun getDeviceId(): String

    /**
     * Get the platform identifier ("android", "ios", or "desktop").
     */
    override fun getPlatform(): String
}

expect fun getPushTokenStorage(): PushTokenStorage
