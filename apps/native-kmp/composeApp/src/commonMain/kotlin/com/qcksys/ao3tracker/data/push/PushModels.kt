package com.qcksys.ao3tracker.data.push

import kotlinx.serialization.Serializable

@Serializable
data class PushTokenRequest(
    val token: String,
    val platform: String, // "android" or "ios"
    val deviceId: String
)

@Serializable
data class PushTokenResponse(
    val success: Boolean,
    val message: String? = null
)

/**
 * Notification type indicating what kind of update occurred for a tracked work.
 */
@Serializable
enum class NotificationType {
    new_chapters,
    work_completed,
    work_restricted,
    work_deleted
}

/**
 * A single notification item from the server.
 */
@Serializable
data class NotificationItem(
    val id: Int,
    val workId: Int,
    val type: NotificationType,
    val title: String,
    val body: String,
    val sentAt: String? = null,
    val createdAt: String
)

/**
 * Response from the GET /api/push/notifications endpoint.
 */
@Serializable
data class NotificationHistoryResponse(
    val notifications: List<NotificationItem>,
    val nextCursor: Int? = null,
    val hasMore: Boolean
)
