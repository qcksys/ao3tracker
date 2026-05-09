package com.qcksys.ao3tracker.data.model

/**
 * Filter mode for tags - cycles through: default -> include -> exclude -> default
 */
enum class TagFilterMode {
    /** Tag is not being filtered on (default OR behavior) */
    DEFAULT,
    /** Tag must be present (AND behavior) */
    INCLUDE,
    /** Tag must not be present (NOT behavior) */
    EXCLUDE
}

/**
 * Fields available for sorting works
 */
enum class SortField(val label: String) {
    LAST_READ("Last Read"),
    FAVOURITE("Favourite"),
    UPDATED("Work Updated"),
    TITLE("Title"),
    AUTHOR("Author"),
    WORD_COUNT("Word Count"),
    CHAPTERS("Chapters"),
    HITS("Hits"),
    KUDOS("Kudos"),
    COMMENTS("Comments"),
    BOOKMARKS("Bookmarks"),
    PUBLISHED("Published"),
    DATE_ADDED("Date Added")
}

/**
 * Sort direction
 */
enum class SortOrder(val label: String) {
    ASCENDING("Ascending"),
    DESCENDING("Descending")
}

/**
 * Sort configuration
 */
data class SortState(
    val field: SortField = SortField.LAST_READ,
    val order: SortOrder = SortOrder.DESCENDING
)

/**
 * Reading status filter options
 */
enum class ReadingStatus {
    /** Works with no reading progress */
    NOT_STARTED,
    /** Works with some progress but not caught up with available chapters */
    IN_PROGRESS,
    /** Read all currently available chapters, but work is incomplete (more chapters expected) */
    CAUGHT_UP,
    /** Finished reading a completed work (all chapters posted and read) */
    FINISHED,
    /** Works marked complete but now have more chapters available */
    HAS_NEW_CHAPTERS,
    /** Private works (restricted access) */
    PRIVATE,
    /** Work where author has posted all chapters (currentChapters == totalChapters) */
    WORK_COMPLETED,
    /** Works marked as favourite */
    FAVOURITE,
    /** Works subscribed for notifications */
    SUBSCRIBED
}

data class FilterState(
    val searchQuery: String = "",
    val ratingFilters: Map<String, TagFilterMode> = emptyMap(),
    val warningFilters: Map<String, TagFilterMode> = emptyMap(),
    val categoryFilters: Map<String, TagFilterMode> = emptyMap(),
    val fandomFilters: Map<String, TagFilterMode> = emptyMap(),
    val relationshipFilters: Map<String, TagFilterMode> = emptyMap(),
    val characterFilters: Map<String, TagFilterMode> = emptyMap(),
    val freeformFilters: Map<String, TagFilterMode> = emptyMap(),
    val readingStatusFilters: Map<ReadingStatus, TagFilterMode> = emptyMap()
) {
    /**
     * True if any tag-based filters are active (excludes search query and reading status).
     */
    val hasActiveTagFilters: Boolean
        get() = ratingFilters.any { it.value != TagFilterMode.DEFAULT } ||
                warningFilters.any { it.value != TagFilterMode.DEFAULT } ||
                categoryFilters.any { it.value != TagFilterMode.DEFAULT } ||
                fandomFilters.any { it.value != TagFilterMode.DEFAULT } ||
                relationshipFilters.any { it.value != TagFilterMode.DEFAULT } ||
                characterFilters.any { it.value != TagFilterMode.DEFAULT } ||
                freeformFilters.any { it.value != TagFilterMode.DEFAULT }

    /**
     * True if any reading status filters are active.
     */
    val hasActiveReadingStatusFilters: Boolean
        get() = readingStatusFilters.any { it.value != TagFilterMode.DEFAULT }

    /**
     * True if any filters are active (includes search query).
     */
    val hasActiveFilters: Boolean
        get() = searchQuery.isNotBlank() || hasActiveTagFilters || hasActiveReadingStatusFilters

    fun clearAll(): FilterState = FilterState()

    // Helper to get included tags for a filter map
    fun getIncludedTags(filters: Map<String, TagFilterMode>): Set<String> =
        filters.filter { it.value == TagFilterMode.INCLUDE }.keys

    // Helper to get excluded tags for a filter map
    fun getExcludedTags(filters: Map<String, TagFilterMode>): Set<String> =
        filters.filter { it.value == TagFilterMode.EXCLUDE }.keys

    // Helper to get included reading statuses
    fun getIncludedReadingStatuses(): Set<ReadingStatus> =
        readingStatusFilters.filter { it.value == TagFilterMode.INCLUDE }.keys

    // Helper to get excluded reading statuses
    fun getExcludedReadingStatuses(): Set<ReadingStatus> =
        readingStatusFilters.filter { it.value == TagFilterMode.EXCLUDE }.keys
}
