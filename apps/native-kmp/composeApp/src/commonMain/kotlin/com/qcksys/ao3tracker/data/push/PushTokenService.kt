package com.qcksys.ao3tracker.data.push

import com.qcksys.ao3tracker.data.auth.AuthService
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.util.AppLogger
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess

/**
 * Service for registering and unregistering push notification tokens with the server.
 */
open class PushTokenService(
    private val appSettings: AppSettings,
    private val authService: AuthService
) {
    private val baseUrl: String
        get() = appSettings.getApiBaseUrl()

    private val client get() = authService.getClient()

    companion object {
        private const val TAG = "PushTokenService"
    }

    /**
     * Register a push token with the server.
     *
     * @param fcmToken The FCM/APNs token to register
     * @param platform The platform ("android" or "ios")
     * @param deviceId A unique device identifier
     * @param authToken The user's authentication token
     */
    open suspend fun registerToken(
        fcmToken: String,
        platform: String,
        deviceId: String,
        authToken: String,
        preferences: NotificationPreferences
    ): Result<Unit> {
        return try {
            val response: HttpResponse = client.post("$baseUrl/push/token") {
                header("Authorization", "Bearer $authToken")
                contentType(ContentType.Application.Json)
                setBody(PushTokenRequest(token = fcmToken, platform = platform, deviceId = deviceId, notificationPreferences = preferences))
            }

            if (response.status.isSuccess()) {
                val registered = response.body<PushTokenResponse>()
                if (!registered.success || registered.notificationPreferences != preferences) {
                    return Result.failure(Exception("Notification settings could not be confirmed. Please try again later."))
                }
                AppLogger.d("Push token registered successfully", TAG)
                Result.success(Unit)
            } else {
                AppLogger.w("Failed to register push token: ${response.status}", TAG)
                Result.failure(Exception("Failed to register push token: ${response.status}"))
            }
        } catch (e: Exception) {
            AppLogger.e("Push token registration failed", TAG, e)
            Result.failure(e)
        }
    }

    /**
     * Unregister a device from push notifications.
     *
     * @param deviceId The device identifier to unregister
     * @param authToken The user's authentication token
     */
    open suspend fun unregisterToken(deviceId: String, authToken: String): Result<Unit> {
        return try {
            val response: HttpResponse = client.delete("$baseUrl/push/token/$deviceId") {
                header("Authorization", "Bearer $authToken")
            }

            if (response.status.isSuccess()) {
                AppLogger.d("Push token unregistered successfully", TAG)
                Result.success(Unit)
            } else {
                AppLogger.w("Failed to unregister push token: ${response.status}", TAG)
                Result.failure(Exception("Failed to unregister push token: ${response.status}"))
            }
        } catch (e: Exception) {
            AppLogger.e("Push token unregistration failed", TAG, e)
            Result.failure(e)
        }
    }

    /**
     * Fetch notification history from the server.
     *
     * @param authToken The user's authentication token
     * @param cursor Optional cursor for pagination (use nextCursor from previous response)
     * @param limit Maximum number of notifications to return (default 50, max 100)
     */
    suspend fun getNotificationHistory(
        authToken: String,
        cursor: Int? = null,
        limit: Int = 50
    ): Result<NotificationHistoryResponse> {
        return try {
            val url = buildString {
                append("$baseUrl/push/notifications")
                append("?limit=$limit")
                if (cursor != null) {
                    append("&cursor=$cursor")
                }
            }

            val response: HttpResponse = client.get(url) {
                header("Authorization", "Bearer $authToken")
            }

            if (response.status.isSuccess()) {
                val historyResponse = response.body<NotificationHistoryResponse>()
                AppLogger.d("Fetched ${historyResponse.notifications.size} notifications", TAG)
                Result.success(historyResponse)
            } else {
                AppLogger.w("Failed to fetch notification history: ${response.status}", TAG)
                Result.failure(Exception("Failed to fetch notification history: ${response.status}"))
            }
        } catch (e: Exception) {
            AppLogger.e("Fetch notification history failed", TAG, e)
            Result.failure(e)
        }
    }
}
