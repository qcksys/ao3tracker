package com.qcksys.ao3tracker.data.database

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

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
data class TagEntity(
    val workId: Long,
    val tag: String,
    val href: String,
    val typeId: Int,
    val rowCreatedAt: Long
)
