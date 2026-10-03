package com.qcksys.ao3tracker.data.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "offline_cleanup")
data class OfflineCleanupEntity(@PrimaryKey val contextId: String, val owner: String)

@Entity(tableName = "offline_context", indices = [Index(value = ["identity"], unique = true)])
data class OfflineContextEntity(
    @PrimaryKey val id: String,
    val identity: String,
    val selected: Boolean,
    val activeSkin: String?
)

@Entity(tableName = "offline_work", primaryKeys = ["contextId", "workId"])
data class OfflineWorkEntity(
    val contextId: String,
    val workId: Long,
    val title: String,
    val chaptersJson: String,
    val pinned: Boolean,
    val observedAt: Long
)

@Entity(tableName = "offline_chapter", primaryKeys = ["contextId", "key"], indices = [Index(value = ["contextId", "workId"])])
data class OfflineChapterEntity(
    val contextId: String,
    val key: String,
    val workId: Long,
    val chapterId: Long,
    val representation: String,
    val url: String,
    val fileHash: String,
    val skinHash: String,
    val resourcesJson: String,
    val savedAt: Long,
    val lastAccessedAt: Long,
    val bytes: Long,
    val downloadUpdatedAt: String? = null
)

@Entity(tableName = "offline_skin", primaryKeys = ["contextId", "hash"])
data class OfflineSkinEntity(
    val contextId: String,
    val hash: String,
    val fileHash: String,
    val resourcesJson: String,
    val savedAt: Long,
    val bytes: Long
)

@Entity(tableName = "offline_resource", primaryKeys = ["contextId", "hash"])
data class OfflineResourceEntity(
    val contextId: String,
    val hash: String,
    val mimeType: String,
    val bytes: Long
)

@Entity(tableName = "offline_job", indices = [Index(value = ["contextId", "workId"])])
data class OfflineJobEntity(
    @PrimaryKey val id: String,
    val contextId: String,
    val workId: Long,
    val mode: String,
    val remainingJson: String,
    val completedJson: String,
    val state: String,
    val retryAt: Long,
    val attempts: Int,
    val error: String?,
    val createdAt: Long
)
