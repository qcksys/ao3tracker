package com.qcksys.ao3tracker.data.settings

import kotlinx.serialization.Serializable

@Serializable
data class BrowsingPreferences(
    val hiddenWorkIds: List<Long> = emptyList(),
    val hiddenTags: List<String> = emptyList(),
    val languageFilterEnabled: Boolean = false,
    val searchLanguage: String = "en",
    val maxFandoms: Int? = null,
    val hiddenWorkTitles: Map<Long, String> = emptyMap(),
    val hideCaughtUp: Boolean = false
)

@Serializable
data class BrowsingState(
    val hiddenWorkIds: List<Long>,
    val hiddenTags: List<String>,
    val savedSearchUrls: List<String>,
    val languageFilterEnabled: Boolean,
    val searchLanguage: String,
    val maxFandoms: Int?,
    val hideCaughtUp: Boolean
)
