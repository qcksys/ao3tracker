package com.qcksys.ao3tracker.data.settings

import kotlinx.serialization.Serializable

@Serializable
data class OfflinePreferences(
    val automatic: Boolean = false,
    val wifiOnly: Boolean = true,
    val prefetchChapters: Int? = 2,
    val autoDeleteRead: Boolean = false
) {
    init { require(prefetchChapters == null || prefetchChapters >= 0) }
}
