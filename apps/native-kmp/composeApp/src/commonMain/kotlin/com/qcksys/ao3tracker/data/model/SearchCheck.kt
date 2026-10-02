package com.qcksys.ao3tracker.data.model

import kotlinx.serialization.Serializable

@Serializable
data class SearchWork(
    val id: Long,
    val updated: String,
    val chapters: String,
    val words: String
)

@Serializable
data class SearchCheckMessage(
    val type: String,
    val pages: Int = 0,
    val context: String = "",
    val works: List<SearchWork>? = null,
    val error: String = "",
    val baseline: Boolean = false,
    val complete: Boolean = true,
    val fullScan: Boolean = false,
    val retryAfterSeconds: Long? = null,
    val nextUrl: String? = null
)

@Serializable
data class SearchChanges(
    val newIds: Set<Long> = emptySet(),
    val updatedIds: Set<Long> = emptySet()
)
