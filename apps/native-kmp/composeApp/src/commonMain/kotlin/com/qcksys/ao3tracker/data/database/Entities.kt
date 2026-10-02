package com.qcksys.ao3tracker.data.database

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity(
    tableName = "works",
    indices = [
        Index("title"),
        Index("author"),
        Index("language"),
        Index("wordCount"),
        Index("published"),
        Index("lastUpdated"),
        Index("rowCreatedAt"),
        Index("rowUpdatedAt"),
        Index("rowDeletedAt")
    ]
)
@Serializable
data class WorkEntity(
    @PrimaryKey
    val id: Long,
    val title: String? = null,
    val author: String? = null,
    val authorUrl: String? = null,
    val summary: String? = null,
    val language: String? = null,
    val wordCount: Int? = null,
    val currentChapters: Int? = null,
    val totalChapters: Int? = null,
    val hits: Int? = null,
    val kudos: Int? = null,
    val bookmarks: Int? = null,
    val comments: Int? = null,
    val published: Long? = null,
    val lastUpdated: Long? = null,
    val lastRefreshed: Long? = null,
    val downloadPath: String? = null,
    val downloadUpdatedAt: String? = null,
    // Local tracking fields (synced with server)
    val isPrivate: Boolean = false, // Requires AO3 login to read (restricted work)
    val subscribed: Boolean = false, // Whether user subscribes to update notifications
    val subscribedUpdatedAt: Long? = null, // Timestamp for LWW conflict resolution
    val favourite: Boolean = false, // Whether user has marked this work as a favourite
    val favouriteUpdatedAt: Long? = null, // Timestamp for LWW conflict resolution
    val lastRead: Long? = null,
    val markedCompleteAt: Long? = null, // When user marked this work as "finished reading"
    val rowCreatedAt: Long,
    val rowUpdatedAt: Long,
    val rowDeletedAt: Long? = null // When user explicitly deleted from tracking
)

@Entity(
    tableName = "chapters",
    primaryKeys = ["workId", "chapterId"],
    foreignKeys = [
        ForeignKey(
            entity = WorkEntity::class,
            parentColumns = ["id"],
            childColumns = ["workId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("workId"),
        Index("rowCreatedAt"),
        Index("rowUpdatedAt"),
        Index("rowDeletedAt")
    ]
)
@Serializable
data class ChapterEntity(
    val workId: Long,
    /** Chapter ID from AO3. Use 0 for single-chapter works where chapter ID is not available. */
    val chapterId: Long = 0,
    val number: Int? = null,
    val title: String? = null,
    val dateUpdated: Long? = null,
    // Local tracking fields
    val readProgress: Float? = null,
    val lastReadAt: Long? = null,
    val markedCompleteAt: Long? = null,
    val rowCreatedAt: Long,
    val rowUpdatedAt: Long,
    val rowDeletedAt: Long? = null
)

@Entity(
    tableName = "tags",
    primaryKeys = ["workId", "tag"],
    foreignKeys = [
        ForeignKey(
            entity = WorkEntity::class,
            parentColumns = ["id"],
            childColumns = ["workId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("typeId"),
        Index("rowCreatedAt")
    ]
)
@Serializable
data class TagEntity(
    val workId: Long,
    val tag: String,
    val href: String,
    val typeId: Int,
    val rowCreatedAt: Long
)

/**
 * Per-user favourite tag filter, used to pin tag chips to the top of the filter
 * sheet. Synced across devices via /api/track/sync's `favouriteTags` block.
 *
 * Tombstones-in-place: unfavouriting sets `favourited = false` rather than deleting,
 * so concurrent unfavourites propagate to other devices via LWW on `updatedAt`.
 * The live set is `WHERE favourited = true`. The push set is `WHERE pendingSync = 1`.
 */
@Entity(
    tableName = "favourite_tag",
    primaryKeys = ["tagType", "tag"],
    indices = [
        Index("favourited"),
        Index("pendingSync")
    ]
)
@Serializable
data class FavouriteTagEntity(
    val tagType: Int,
    val tag: String,
    val favourited: Boolean,
    /** Epoch millis of the last add/remove. Used for LWW against the server. */
    val updatedAt: Long,
    /** True if this row has a local change that hasn't been pushed to the server yet. */
    val pendingSync: Boolean
)

/**
 * A named AO3 filter/search URL the user saved. Synced across devices via
 * /api/track/sync's `savedSearches` block.
 *
 * Tombstones-in-place: deleting sets `deleted = true` rather than removing the
 * row, so concurrent deletes propagate to other devices via LWW on `updatedAt`.
 * The live set is `WHERE deleted = 0`. The push set is `WHERE pendingSync = 1`.
 * `id` is a client-generated uuid (stable identity, so name/url can change).
 */
@Entity(
    tableName = "saved_search",
    indices = [
        Index("deleted"),
        Index("pendingSync")
    ]
)
@Serializable
data class SavedSearchEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val url: String,
    val deleted: Boolean,
    /** Epoch millis of the last save/edit/delete. Used for LWW against the server. */
    val updatedAt: Long,
    /** True if this row has a local change that hasn't been pushed to the server yet. */
    val pendingSync: Boolean
)

@Entity(tableName = "active_account")
data class ActiveAccountEntity(
    @PrimaryKey val id: Int = 0,
    val owner: String,
    val remoteCursor: String? = null,
    val localCursor: Long? = null
)

@Entity(tableName = "account_archive")
data class AccountArchiveEntity(
    @PrimaryKey val owner: String,
    val data: String,
    val remoteCursor: String? = null,
    val localCursor: Long? = null
)

@Entity(tableName = "account_database")
data class AccountDatabaseEntity(
    @PrimaryKey val owner: String,
    val fileName: String,
    val selected: Boolean = false
)
