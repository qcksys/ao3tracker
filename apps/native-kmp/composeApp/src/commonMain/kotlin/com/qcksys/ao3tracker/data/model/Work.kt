package com.qcksys.ao3tracker.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Work(
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
    val isPrivate: Boolean = false,
    val subscribed: Boolean = false,
    val favourite: Boolean = false,
    val lastRead: Long? = null,
    val markedCompleteAt: Long? = null,
    val rowCreatedAt: Long,
    val rowUpdatedAt: Long,
    val rowDeletedAt: Long? = null,
    val tags: List<Tag> = emptyList(),
    val chapterList: List<Chapter> = emptyList()
) {
    val chapterProgress: String
        get() {
            val current = currentChapters ?: chapterList.size
            return if (totalChapters != null) {
                "$current/$totalChapters"
            } else {
                "$current/?"
            }
        }

    val readProgress: Float
        get() {
            if (chapterList.isEmpty()) return 0f
            val total = totalChapters ?: currentChapters ?: chapterList.size
            if (total == 0) return 0f
            val totalProgress = chapterList.sumOf { (it.readProgress ?: 0f).toDouble() }
            return (totalProgress / total).toFloat().coerceIn(0f, 1f)
        }

    val lastChapterRead: Chapter?
        get() = chapterList.filter { it.rowDeletedAt == null }.maxByOrNull { it.lastReadAt ?: 0L }

    val wordCountFormatted: String
        get() = wordCount?.let { formatNumber(it) } ?: "?"

    val hitsFormatted: String
        get() = hits?.let { formatNumber(it) } ?: "?"

    val kudosFormatted: String
        get() = kudos?.let { formatNumber(it) } ?: "?"

    val bookmarksFormatted: String
        get() = bookmarks?.let { formatNumber(it) } ?: "?"

    val commentsFormatted: String
        get() = comments?.let { formatNumber(it) } ?: "?"

    private fun formatNumber(n: Int): String {
        return n.toString().reversed().chunked(3).joinToString(",").reversed()
    }
}

@Serializable
data class Chapter(
    val id: Long,
    val workId: Long,
    val number: Int? = null,
    val title: String? = null,
    val dateUpdated: Long? = null,
    val readProgress: Float? = null,
    val lastReadAt: Long? = null,
    val markedCompleteAt: Long? = null,
    val rowCreatedAt: Long,
    val rowUpdatedAt: Long,
    val rowDeletedAt: Long? = null
) {
    val displayTitle: String
        get() = title ?: "Chapter ${number ?: "?"}"

    val progressPercent: Int
        get() = ((readProgress ?: 0f) * 100).toInt()

    val isComplete: Boolean
        get() = markedCompleteAt != null || (readProgress ?: 0f) >= 0.95f
}

@Serializable
data class Tag(
    val workId: Long,
    val tag: String,
    val href: String,
    val typeId: Int,
    val rowCreatedAt: Long
) {
    val type: TagType
        get() = TagType.fromId(typeId)
}
