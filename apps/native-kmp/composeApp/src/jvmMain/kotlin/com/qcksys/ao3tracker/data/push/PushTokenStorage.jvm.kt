package com.qcksys.ao3tracker.data.push

/**
 * JVM Desktop stub for PushTokenStorage.
 * Desktop platforms don't support push notifications, so this is a no-op implementation.
 */
actual fun getPushTokenStorage(): PushTokenStorage = PushTokenStorage()

actual class PushTokenStorage : PushTokenStore {
    /**
     * Desktop doesn't support FCM tokens - always returns null.
     */
    actual override fun getFcmToken(): String? = null

    /**
     * No-op on desktop - tokens are not supported.
     */
    actual override fun saveFcmToken(token: String) {
        // No-op: Desktop doesn't support push notifications
    }

    /**
     * No-op on desktop - tokens are not supported.
     */
    actual override fun clearFcmToken() {
        // No-op: Desktop doesn't support push notifications
    }

    /**
     * Returns a stable device identifier for desktop.
     * Uses the system user name as a simple identifier.
     */
    actual override fun getDeviceId(): String {
        return "desktop-${System.getProperty("user.name") ?: "unknown"}"
    }

    /**
     * Returns "desktop" to indicate this is a desktop platform without push support.
     */
    actual override fun getPlatform(): String = "desktop"
}
