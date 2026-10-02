package com.qcksys.ao3tracker.data.push

import android.content.Context
import android.content.SharedPreferences
import io.github.aakira.napier.Napier
import java.util.UUID
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private lateinit var appContext: Context

fun initializePushTokenStorage(context: Context) {
    appContext = context.applicationContext
}

actual fun getPushTokenStorage(): PushTokenStorage = PushTokenStorage()

actual class PushTokenStorage : PushTokenStore {
    private val prefs: SharedPreferences by lazy {
        appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    actual override fun getFcmToken(): String? {
        val token = prefs.getString(KEY_FCM_TOKEN, null)
        Napier.d("getFcmToken: ${if (token != null) "found (${token.take(10)}...)" else "null"}")
        return token
    }

    override suspend fun fetchFcmToken(): String? = suspendCancellableCoroutine { continuation ->
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                saveFcmToken(token)
                continuation.resume(token)
            }
            .addOnFailureListener { error -> continuation.resumeWithException(error) }
    }

    actual override fun saveFcmToken(token: String) {
        Napier.d("saveFcmToken: saving token (${token.take(10)}...)")
        prefs.edit().putString(KEY_FCM_TOKEN, token).apply()
    }

    actual override fun clearFcmToken() {
        Napier.d("clearFcmToken: clearing token")
        prefs.edit().remove(KEY_FCM_TOKEN).apply()
    }

    actual override fun getDeviceId(): String {
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)
        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
            Napier.d("getDeviceId: generated new deviceId=$deviceId")
        }
        return deviceId
    }

    actual override fun getPlatform(): String = "android"

    companion object {
        private const val PREFS_NAME = "ao3_push_prefs"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_DEVICE_ID = "device_id"
    }
}
