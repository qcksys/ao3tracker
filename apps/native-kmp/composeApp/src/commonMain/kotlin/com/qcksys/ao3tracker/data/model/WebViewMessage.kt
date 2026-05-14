package com.qcksys.ao3tracker.data.model

import kotlinx.serialization.Serializable

@Serializable
data class WorkInfoEvent(
    val type: String = "workInfo",
    val url: String,
    val workName: String? = null,
    val workLastUpdated: String? = null,
    val chapterId: String? = null,
    val chapterName: String? = null,
    val chapterNumber: String? = null,
    val totalChapters: String? = null,
    val authorUrl: String? = null,
    val authorName: String? = null,
    val summary: String? = null,
    val wordCount: String? = null,
    val language: String? = null,
    val kudos: String? = null,
    val hits: String? = null,
    val bookmarks: String? = null,
    val comments: String? = null,
    val downloadPath: String? = null,
    val downloadUpdatedAt: String? = null,
    val isPrivate: Boolean = false
)

@Serializable
data class TagInfo(
    val tag: String? = null,
    val href: String? = null
)

@Serializable
data class WorkTagsEvent(
    val type: String = "workTags",
    val url: String,
    val workLastUpdated: String? = null,
    val rating: TagInfo? = null,
    val warning: List<TagInfo> = emptyList(),
    val category: List<TagInfo> = emptyList(),
    val fandom: List<TagInfo> = emptyList(),
    val relationship: List<TagInfo> = emptyList(),
    val character: List<TagInfo> = emptyList(),
    val freeform: List<TagInfo> = emptyList()
)

@Serializable
data class ChapterInfo(
    val chapterDate: String? = null,
    val chapterNumber: String? = null,
    val chapterUrl: String? = null
)

@Serializable
data class WorkChapterIndexEvent(
    val type: String = "workChapterIndex",
    val url: String,
    val authorUrl: String? = null,
    val chapters: List<ChapterInfo> = emptyList()
)

@Serializable
data class ScrollProgressEvent(
    val type: String = "scrollProgress",
    val url: String,
    val scrollPercentage: Int
)

@Serializable
data class ListWorksEvent(
    val type: String = "listWorks",
    val url: String,
    val workIds: List<Long> = emptyList()
)

/**
 * Payload sent back to the WebView to render a tracker badge on a list page.
 * Status values must stay in sync with `WorkBadgeData` in webview-scripts/src/ao3-tracking.ts.
 */
@Serializable
data class WorkBadgePayload(
    val id: Long,
    val status: String,
    val progressPercent: Int,
    val favourite: Boolean
)
