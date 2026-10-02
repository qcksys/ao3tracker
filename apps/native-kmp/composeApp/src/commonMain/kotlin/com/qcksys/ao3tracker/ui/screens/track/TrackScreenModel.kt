package com.qcksys.ao3tracker.ui.screens.track

import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import com.qcksys.ao3tracker.data.model.FilterState
import com.qcksys.ao3tracker.data.model.ReadingStatus
import com.qcksys.ao3tracker.data.model.SortField
import com.qcksys.ao3tracker.data.model.SortOrder
import com.qcksys.ao3tracker.data.model.SortState
import com.qcksys.ao3tracker.data.model.SyncState
import com.qcksys.ao3tracker.data.model.TagFilterMode
import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.data.model.Work
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.sync.SyncCoordinator
import com.qcksys.ao3tracker.data.sync.SyncCompletion
import com.qcksys.ao3tracker.data.sync.SyncTriggers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Identifiers for filter sections to track expanded state
 */
enum class FilterSection {
    FAVOURITES,
    READING_STATUS,
    RATING,
    WARNING,
    CATEGORY,
    FANDOM,
    RELATIONSHIP,
    CHARACTER,
    FREEFORM
}

class TrackScreenModel(
    private val repository: Ao3Repository,
    private val syncCoordinator: SyncCoordinator,
    private val favouriteTagRepository: FavouriteTagRepository,
    private val syncTriggers: SyncTriggers
) : ScreenModel {

    private val _filterState = MutableStateFlow(FilterState())
    val filterState: StateFlow<FilterState> = _filterState.asStateFlow()

    val favouriteTagFilters: StateFlow<Set<String>> = favouriteTagRepository
        .observeFavourites()
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptySet()
        )

    private val _sortState = MutableStateFlow(SortState())
    val sortState: StateFlow<SortState> = _sortState.asStateFlow()

    private val _isFilterSheetVisible = MutableStateFlow(false)
    val isFilterSheetVisible: StateFlow<Boolean> = _isFilterSheetVisible.asStateFlow()

    private val _isSortMenuVisible = MutableStateFlow(false)
    val isSortMenuVisible: StateFlow<Boolean> = _isSortMenuVisible.asStateFlow()

    // Filter sheet UI state (persisted across sheet open/close)
    private val _filterTagSearchQuery = MutableStateFlow("")
    val filterTagSearchQuery: StateFlow<String> = _filterTagSearchQuery.asStateFlow()

    private val _expandedFilterSections = MutableStateFlow<Set<FilterSection>>(emptySet())
    val expandedFilterSections: StateFlow<Set<FilterSection>> = _expandedFilterSections.asStateFlow()

    // Sync state
    val syncState: StateFlow<SyncState> = syncCoordinator.syncState
    val lastSyncResult = syncCoordinator.lastSyncResult

    @OptIn(ExperimentalCoroutinesApi::class)
    val works: StateFlow<List<Work>> = combine(
        _filterState.flatMapLatest { filter -> repository.getFilteredWorks(filter) },
        _sortState
    ) { workList, sort ->
        sortWorks(workList, sort)
    }.stateIn(
        scope = screenModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    // Total works count (unfiltered)
    val totalWorksCount: StateFlow<Int> = repository
        .getFilteredWorks(FilterState())
        .map { works -> works.size }
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = 0
        )

    // Use Eagerly to preload filter options so they're ready when the filter sheet opens
    val availableRatings: StateFlow<List<String>> = repository
        .getDistinctTags(TagType.RATING)
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptyList()
        )

    val availableWarnings: StateFlow<List<String>> = repository
        .getDistinctTags(TagType.WARNING)
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptyList()
        )

    val availableCategories: StateFlow<List<String>> = repository
        .getDistinctTags(TagType.CATEGORY)
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptyList()
        )

    val availableFandoms: StateFlow<List<String>> = repository
        .getDistinctTags(TagType.FANDOM)
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptyList()
        )

    val availableRelationships: StateFlow<List<String>> = repository
        .getDistinctTags(TagType.RELATIONSHIP)
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptyList()
        )

    val availableCharacters: StateFlow<List<String>> = repository
        .getDistinctTags(TagType.CHARACTER)
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptyList()
        )

    val availableFreeformTags: StateFlow<List<String>> = repository
        .getDistinctTags(TagType.FREEFORM)
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptyList()
        )

    fun updateSearchQuery(query: String) {
        _filterState.value = _filterState.value.copy(searchQuery = query)
    }

    /**
     * Cycles through filter modes: DEFAULT -> INCLUDE -> EXCLUDE -> DEFAULT
     */
    private fun cycleFilterMode(currentMode: TagFilterMode?): TagFilterMode? {
        return when (currentMode) {
            null, TagFilterMode.DEFAULT -> TagFilterMode.INCLUDE
            TagFilterMode.INCLUDE -> TagFilterMode.EXCLUDE
            TagFilterMode.EXCLUDE -> null // Remove from map (back to default)
        }
    }

    private fun <K> cycleFilter(current: Map<K, TagFilterMode>, key: K): Map<K, TagFilterMode> {
        val currentMode = current[key]
        val newMode = cycleFilterMode(currentMode)
        return if (newMode == null) {
            current - key
        } else {
            current + (key to newMode)
        }
    }

    fun toggleRating(rating: String) {
        _filterState.value = _filterState.value.copy(
            ratingFilters = cycleFilter(_filterState.value.ratingFilters, rating)
        )
    }

    fun toggleWarning(warning: String) {
        _filterState.value = _filterState.value.copy(
            warningFilters = cycleFilter(_filterState.value.warningFilters, warning)
        )
    }

    fun toggleCategory(category: String) {
        _filterState.value = _filterState.value.copy(
            categoryFilters = cycleFilter(_filterState.value.categoryFilters, category)
        )
    }

    fun toggleFandom(fandom: String) {
        _filterState.value = _filterState.value.copy(
            fandomFilters = cycleFilter(_filterState.value.fandomFilters, fandom)
        )
    }

    fun toggleRelationship(relationship: String) {
        _filterState.value = _filterState.value.copy(
            relationshipFilters = cycleFilter(_filterState.value.relationshipFilters, relationship)
        )
    }

    fun toggleCharacter(character: String) {
        _filterState.value = _filterState.value.copy(
            characterFilters = cycleFilter(_filterState.value.characterFilters, character)
        )
    }

    fun toggleFreeformTag(tag: String) {
        _filterState.value = _filterState.value.copy(
            freeformFilters = cycleFilter(_filterState.value.freeformFilters, tag)
        )
    }

    /** Cycle the filter mode for a tag, dispatched by tag type. */
    fun toggleTagFilter(tagType: TagType, tag: String) {
        when (tagType) {
            TagType.RATING -> toggleRating(tag)
            TagType.WARNING -> toggleWarning(tag)
            TagType.CATEGORY -> toggleCategory(tag)
            TagType.FANDOM -> toggleFandom(tag)
            TagType.RELATIONSHIP -> toggleRelationship(tag)
            TagType.CHARACTER -> toggleCharacter(tag)
            TagType.FREEFORM -> toggleFreeformTag(tag)
            TagType.UNKNOWN -> {}
        }
    }

    fun toggleReadingStatus(status: ReadingStatus) {
        _filterState.value = _filterState.value.copy(
            readingStatusFilters = cycleFilter(_filterState.value.readingStatusFilters, status)
        )
    }

    fun clearAllFilters() {
        _filterState.value = FilterState()
    }

    fun setTagFilter(tagType: TagType, tag: String) {
        _filterState.update { current ->
            val includedTag = tag to TagFilterMode.INCLUDE
            when (tagType) {
                TagType.RATING -> current.copy(ratingFilters = current.ratingFilters + includedTag)
                TagType.WARNING -> current.copy(warningFilters = current.warningFilters + includedTag)
                TagType.CATEGORY -> current.copy(categoryFilters = current.categoryFilters + includedTag)
                TagType.FANDOM -> current.copy(fandomFilters = current.fandomFilters + includedTag)
                TagType.RELATIONSHIP -> current.copy(relationshipFilters = current.relationshipFilters + includedTag)
                TagType.CHARACTER -> current.copy(characterFilters = current.characterFilters + includedTag)
                TagType.FREEFORM -> current.copy(freeformFilters = current.freeformFilters + includedTag)
                TagType.UNKNOWN -> current
            }
        }
    }

    fun showFilterSheet() {
        _isFilterSheetVisible.value = true
    }

    fun hideFilterSheet() {
        _isFilterSheetVisible.value = false
    }

    fun showSortMenu() {
        _isSortMenuVisible.value = true
    }

    fun hideSortMenu() {
        _isSortMenuVisible.value = false
    }

    fun setSortField(field: SortField) {
        _sortState.value = _sortState.value.copy(field = field)
    }

    fun setSortOrder(order: SortOrder) {
        _sortState.value = _sortState.value.copy(order = order)
    }

    fun toggleSortOrder() {
        _sortState.value = _sortState.value.copy(
            order = if (_sortState.value.order == SortOrder.ASCENDING) {
                SortOrder.DESCENDING
            } else {
                SortOrder.ASCENDING
            }
        )
    }

    fun updateFilterTagSearchQuery(query: String) {
        _filterTagSearchQuery.value = query
    }

    fun toggleFilterSectionExpanded(section: FilterSection) {
        val current = _expandedFilterSections.value
        _expandedFilterSections.value = if (section in current) {
            current - section
        } else {
            current + section
        }
    }

    fun isFilterSectionExpanded(section: FilterSection): Boolean {
        return section in _expandedFilterSections.value
    }

    fun deleteWork(workId: Long) {
        screenModelScope.launch {
            repository.deleteWork(workId)
        }
    }

    fun toggleFavourite(workId: Long, currentValue: Boolean) {
        screenModelScope.launch {
            repository.updateWorkFavourite(workId, !currentValue)
        }
    }

    fun subscribeAll() {
        screenModelScope.launch {
            repository.updateAllWorksSubscription(true)
        }
    }

    fun unsubscribeAll() {
        screenModelScope.launch {
            repository.updateAllWorksSubscription(false)
        }
    }

    fun sync() {
        syncCoordinator.requestSync()
    }

    fun clearSyncResult(completion: SyncCompletion) {
        syncCoordinator.clearLastSyncResult(completion)
    }

    fun isFavouriteTag(tagType: TagType, tag: String): Boolean {
        return favouriteKey(tagType, tag) in favouriteTagFilters.value
    }

    fun toggleFavouriteTag(tagType: TagType, tag: String) {
        screenModelScope.launch {
            favouriteTagRepository.toggleFavourite(tagType, tag)
            syncTriggers.notifyFavouriteChanged()
        }
    }

    private fun favouriteKey(tagType: TagType, tag: String): String = "${tagType.id}\t$tag"
}
