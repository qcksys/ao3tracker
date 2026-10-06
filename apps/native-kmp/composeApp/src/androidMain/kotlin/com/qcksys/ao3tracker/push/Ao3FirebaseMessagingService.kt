package com.qcksys.ao3tracker.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.qcksys.ao3tracker.MainActivity
import com.qcksys.ao3tracker.data.push.PushTokenStorage
import com.qcksys.ao3tracker.data.push.getPushTokenStorage
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.getSettingsStorage
import io.github.aakira.napier.Napier

/**
 * Firebase Cloud Messaging service for handling push notifications.
 * Handles token refresh and incoming notification messages.
 */
class Ao3FirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        const val CHANNEL_ID = "ao3_work_updates"
        const val CHANNEL_NAME = "Work Updates"
        const val ACTION_OPEN_WORK = "com.qcksys.ao3tracker.OPEN_WORK"
        const val EXTRA_WORK_ID = "work_id"
        private const val TAG = "Ao3FCMService"

        fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Notifications when subscribed works are updated on AO3"
                }
                context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
            }
        }
    }

    private val pushTokenStorage: PushTokenStorage by lazy { getPushTokenStorage() }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel(this)
    }

    /**
     * Called when FCM token is generated or refreshed.
     * Saves the token locally - it will be registered with the server on next app launch.
     */
    override fun onNewToken(token: String) {
        Napier.d("FCM token refreshed: ${token.take(10)}...", tag = TAG)
        pushTokenStorage.saveFcmToken(token)
        // Note: Token registration with server happens in PushRepository on app startup
        // when the user is authenticated. This service doesn't have access to auth state.
    }

    /**
     * Called when a message is received while app is in foreground.
     * Background messages are handled by the system notification tray.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Napier.d("FCM message received from: ${remoteMessage.from}", tag = TAG)

        val workId = remoteMessage.data["workId"]?.toLongOrNull()
        val type = remoteMessage.data["type"]
        if (!AppSettings(getSettingsStorage()).notificationPreferences.value.allows(type)) return

        Napier.d("Message data - workId: $workId, type: $type", tag = TAG)

        // Extract notification content (if sent as notification payload)
        val title = remoteMessage.notification?.title ?: "Work Updated"
        val body = remoteMessage.notification?.body ?: "A subscribed work has been updated"

        showNotification(title, body, workId)
    }

    /**
     * Shows a notification for a work update.
     */
    private fun showNotification(title: String, body: String, workId: Long?) {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_OPEN_WORK
            workId?.let { putExtra(EXTRA_WORK_ID, it) }
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            workId?.toInt() ?: 0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(workId?.toInt() ?: System.currentTimeMillis().toInt(), notification)

        Napier.d("Notification shown for workId: $workId", tag = TAG)
    }
}
