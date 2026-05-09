package com.qcksys.ao3tracker.data.model

import kotlinx.serialization.Serializable

/**
 * Sync request/response models for the /api/track/sync endpoint
 *
 * Sync uses a two-step process:
 * 1. GET /api/track/sync - Fetch server data (returns SyncGetResponse)
 * 2. POST /api/track/sync - Send client data (returns SyncPostResponse)
 */

/**
 * Request body for POST /api/track/sync
 */
@Serializable
data class SyncPostRequest(
    val works: List<SyncWorkRequest>,
    val chapters: List<SyncChapterRequest>
)

@Serializable
data class SyncWorkRequest(
    val workId: Long,
    val lastReadAt: String,
    val markedCompleteAt: String? = null,
    val private: Boolean = false,
    val subscribed: Boolean = false,
    val subscribedUpdatedAt: String? = null,
    val favourite: Boolean = false,
    val favouriteUpdatedAt: String? = null,
    val deleted: Boolean = false
)

@Serializable
data class SyncChapterRequest(
    val workId: Long,
    val chapterId: Long,
    val lastReadAt: String,
    val markedCompleteAt: String? = null,
    val readProgress: Float,
    val deleted: Boolean = false
)

/**
 * Response from GET /api/track/sync
 */
@Serializable
data class SyncGetResponse(
    val works: List<SyncWorkResponse>,
    val chapters: List<SyncChapterResponse>,
    val workMetadata: List<SyncWorkMetadata> = emptyList(),
    val chapterMetadata: List<SyncChapterMetadata> = emptyList(),
    val tagMetadata: List<SyncTagMetadata> = emptyList(),
    val serverLastUpdated: String,
    /** ISO 8601 timestamp of most recent work lastReadAt, or null if user has no tracked works */
    val latestWorkLastReadAt: String? = null,
    val hasMore: Boolean,
    val nextWorkCursor: Long? = null
)

@Serializable
data class SyncWorkResponse(
    val workId: Long,
    val lastReadAt: String,
    val markedCompleteAt: String? = null,
    val private: Boolean = false,
    val subscribed: Boolean = false,
    val subscribedUpdatedAt: String? = null,
    val favourite: Boolean = false,
    val favouriteUpdatedAt: String? = null,
    val deleted: Boolean = false
)

@Serializable
data class SyncChapterResponse(
    val workId: Long,
    val chapterId: Long,
    val lastReadAt: String,
    val markedCompleteAt: String? = null,
    val readProgress: Float,
    val deleted: Boolean = false
)

/**
 * Response from POST /api/track/sync
 */
@Serializable
data class SyncPostResponse(
    val works: List<SyncWorkStatus>,
    val chapters: List<SyncChapterStatus>,
    val syncedAt: String
)

@Serializable
data class SyncWorkStatus(
    val workId: Long,
    val status: String // "accepted", "ignored", "deleted"
)

@Serializable
data class SyncChapterStatus(
    val workId: Long,
    val chapterId: Long,
    val status: String // "accepted", "ignored"
)

@Serializable
data class SyncWorkMetadata(
    val id: Long,
    val title: String,
    val author: String,
    val authorUrl: String? = null,
    val summary: String? = null,
    val language: String,
    val wordCount: Int,
    val currentChapters: Int,
    val totalChapters: Int? = null,
    val hits: Int,
    val kudos: Int,
    val bookmarks: Int,
    val comments: Int,
    val published: String,
    val lastUpdated: String,
    val downloadPath: String? = null,
    val downloadUpdatedAt: String? = null
)

@Serializable
data class SyncChapterMetadata(
    val id: Long,
    val workId: Long,
    val number: Int? = null,
    val title: String? = null,
    val dateUpdated: String? = null
)

@Serializable
data class SyncTagMetadata(
    val workId: Long,
    val tag: String,
    val href: String,
    val type: String // "rating", "warning", "category", "fandom", "relationship", "character", "freeform", "unknown"
)

/**
 * Local sync state tracking
 */
@Serializable
data class SyncState(
    val lastSyncedAt: String? = null,
    val isSyncing: Boolean = false,
    val statusMessage: String? = null,
    val error: String? = null
)

/**
 * Result of a sync operation
 */
sealed class SyncResult {
    data class Success(
        val worksFromServer: Int,
        val chaptersFromServer: Int,
        val worksToServer: Int,
        val chaptersToServer: Int,
        val syncedAt: String
    ) : SyncResult()

    data class Error(val message: String) : SyncResult()

    data object NotAuthenticated : SyncResult()
}
