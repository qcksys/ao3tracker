package com.qcksys.ao3tracker.data.push

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class NotificationPreferences(
    val enabled: Boolean = true,
    @SerialName("new_chapters") val newChapters: Boolean = true,
    @SerialName("work_completed") val workCompleted: Boolean = true,
    @SerialName("work_restricted") val workRestricted: Boolean = true,
    @SerialName("work_deleted") val workDeleted: Boolean = true
) {
    fun allows(type: String?): Boolean = enabled && when (type) {
        "new_chapters" -> newChapters
        "work_completed" -> workCompleted
        "work_restricted" -> workRestricted
        "work_deleted" -> workDeleted
        else -> true
    }
}
