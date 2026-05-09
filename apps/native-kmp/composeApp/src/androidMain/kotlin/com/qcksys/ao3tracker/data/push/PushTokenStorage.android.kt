package com.qcksys.ao3tracker.data.push

import android.content.Context
import android.content.SharedPreferences
import io.github.aakira.napier.Napier
import java.util.UUID

private lateinit var appContext: Context

fun initializePushTokenStorage(context: Context) {
    appContext = context.applicationContext
}

actual fun getPushTokenStorage(): PushTokenStorage = PushTokenStorage()

actual class PushTokenStorage {
    private val prefs: SharedPreferences by lazy {
        appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    actual fun getFcmToken(): String? {
        val token = prefs.getString(KEY_FCM_TOKEN, null)
        Napier.d("getFcmToken: ${if (token != null) "found (${token.take(10)}...)" else "null"}")
        return token
    }

    actual fun saveFcmToken(token: String) {
        Napier.d("saveFcmToken: saving token (${token.take(10)}...)")
        prefs.edit().putString(KEY_FCM_TOKEN, token).apply()
    }

    actual fun clearFcmToken() {
        Napier.d("clearFcmToken: clearing token")
        prefs.edit().remove(KEY_FCM_TOKEN).apply()
    }

    actual fun getDeviceId(): String {
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)
        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
            Napier.d("getDeviceId: generated new deviceId=$deviceId")
        }
        return deviceId
    }

    actual fun getPlatform(): String = "android"

    companion object {
        private const val PREFS_NAME = "ao3_push_prefs"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_DEVICE_ID = "device_id"
    }
}
