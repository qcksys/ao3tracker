package com.qcksys.ao3tracker.data.push

import platform.Foundation.NSUserDefaults
import platform.Foundation.NSUUID

actual fun getPushTokenStorage(): PushTokenStorage = PushTokenStorage()

/**
 * iOS Push Token Storage using NSUserDefaults.
 * FCM token is stored after Firebase/APNs registration in Swift code.
 */
actual class PushTokenStorage : PushTokenStore {
    private val userDefaults = NSUserDefaults.standardUserDefaults

    actual override fun getFcmToken(): String? {
        return userDefaults.stringForKey(KEY_FCM_TOKEN)
    }

    actual override fun saveFcmToken(token: String) {
        userDefaults.setObject(token, KEY_FCM_TOKEN)
        userDefaults.synchronize()
    }

    actual override fun clearFcmToken() {
        userDefaults.removeObjectForKey(KEY_FCM_TOKEN)
        userDefaults.synchronize()
    }

    actual override fun getDeviceId(): String {
        var deviceId = userDefaults.stringForKey(KEY_DEVICE_ID)
        if (deviceId == null) {
            deviceId = NSUUID().UUIDString
            userDefaults.setObject(deviceId, KEY_DEVICE_ID)
            userDefaults.synchronize()
        }
        return deviceId
    }

    actual override fun getPlatform(): String = "ios"

    companion object {
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_DEVICE_ID = "device_id"
    }
}
