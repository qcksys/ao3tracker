package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.RadioButton
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import cafe.adriel.voyager.navigator.tab.LocalTabNavigator
import com.qcksys.ao3tracker.data.model.FilterState
import com.qcksys.ao3tracker.data.model.ReadingStatus
import com.qcksys.ao3tracker.data.model.SortField
import com.qcksys.ao3tracker.data.model.SortOrder
import com.qcksys.ao3tracker.data.model.SyncResult
import com.qcksys.ao3tracker.data.model.TagFilterMode
import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.data.model.Work
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import com.qcksys.ao3tracker.ui.components.SyncDebugDialog
import com.qcksys.ao3tracker.ui.navigation.ReadTab
import com.qcksys.ao3tracker.ui.navigation.SettingsTab
import com.qcksys.ao3tracker.ui.screens.workdetail.WorkDetailScreen
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackScreen() {
    val screenModel = koinInject<TrackScreenModel>()
    val navigator = LocalNavigator.currentOrThrow
    val tabNavigator = LocalTabNavigator.current
    val works by screenModel.works.collectAsState()
    val totalWorksCount by screenModel.totalWorksCount.collectAsState()
    val filterState by screenModel.filterState.collectAsState()
    val isFilterSheetVisible by screenModel.isFilterSheetVisible.collectAsState()
    val sheetState = rememberModalBottomSheetState()

    // Sort state
    val sortState by screenModel.sortState.collectAsState()
    val isSortMenuVisible by screenModel.isSortMenuVisible.collectAsState()

    // Sync state
    val syncState by screenModel.syncState.collectAsState()
    var showSyncDebug by remember { mutableStateOf(false) }
    val lastSyncResult by screenModel.lastSyncResult.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    var isSubscriptionMenuVisible by remember { mutableStateOf(false) }

    // Scroll state for the works list
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val showScrollToTop by remember {
        derivedStateOf { listState.firstVisibleItemIndex > 2 }
    }

    // Show snackbar when sync completes
    LaunchedEffect(lastSyncResult) {
        lastSyncResult?.let { completion ->
            val result = completion.result
            val message = if (completion.signedOut) "Signed out and cleared local data" else when (result) {
                is SyncResult.Success -> "Synced: ${result.worksFromServer}/${result.chaptersFromServer} from server, ${result.worksToServer}/${result.chaptersToServer} to server"
                is SyncResult.Error -> "Sync failed: ${result.message}"
                is SyncResult.NotAuthenticated -> "Please sign in to sync"
            }
            val actionLabel = if (result is SyncResult.NotAuthenticated) "Sign In" else null
            val snackbarResult = snackbarHostState.showSnackbar(
                message = message,
                actionLabel = actionLabel
            )
            screenModel.clearSyncResult(completion)
            if (snackbarResult == SnackbarResult.ActionPerformed) {
                tabNavigator.current = SettingsTab
            }
        }
    }

    // Scroll to top when sort order changes
    LaunchedEffect(sortState) {
        listState.scrollToItem(0)
    }

    // Handle pending tag filter from navigation
    val pendingTagFilter by NavigationState.pendingTagFilter.collectAsState()
    LaunchedEffect(pendingTagFilter) {
        pendingTagFilter?.let { filter ->
            screenModel.setTagFilter(filter.tagType, filter.tag)
            NavigationState.clearPendingTagFilter()
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text("Works", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                actions = {
                    // Sync button
                    IconButton(
                        onClick = {
                            if (syncState.isSyncing) showSyncDebug = true else screenModel.sync()
                        },
                        modifier = Modifier.semantics {
                            contentDescription = if (syncState.isSyncing) "Show sync debug progress" else "Sync"
                        }
                    ) {
                        if (syncState.isSyncing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Sync,
                                contentDescription = "Sync"
                            )
                        }
                    }
                    // Subscription menu
                    Box {
                        IconButton(onClick = { isSubscriptionMenuVisible = true }) {
                            Icon(
                                imageVector = Icons.Default.Notifications,
                                contentDescription = "Subscription options"
                            )
                        }
                        DropdownMenu(
                            expanded = isSubscriptionMenuVisible,
                            onDismissRequest = { isSubscriptionMenuVisible = false }
                        ) {
                            DropdownMenuItem(
                                text = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Default.Notifications,
                                            contentDescription = null,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Subscribe All")
                                    }
                                },
                                onClick = {
                                    screenModel.subscribeAll()
                                    isSubscriptionMenuVisible = false
                                }
                            )
                            DropdownMenuItem(
                                text = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Default.NotificationsOff,
                                            contentDescription = null,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Unsubscribe All")
                                    }
                                },
                                onClick = {
                                    screenModel.unsubscribeAll()
                                    isSubscriptionMenuVisible = false
                                }
                            )
                        }
                    }
                    IconButton(onClick = { screenModel.showFilterSheet() }) {
                        Icon(
                            imageVector = Icons.Default.FilterList,
                            contentDescription = "Filter"
                        )
                    }
                    Box {
                        IconButton(onClick = { screenModel.showSortMenu() }) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Sort,
                                contentDescription = "Sort"
                            )
                        }
                        DropdownMenu(
                            expanded = isSortMenuVisible,
                            onDismissRequest = { screenModel.hideSortMenu() }
                        ) {
                            // Sort field options
                            SortField.entries.forEach { field ->
                                DropdownMenuItem(
                                    text = {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            RadioButton(
                                                selected = sortState.field == field,
                                                onClick = null
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(field.label)
                                        }
                                    },
                                    onClick = {
                                        screenModel.setSortField(field)
                                    }
                                )
                            }
                            HorizontalDivider()
                            // Sort order toggle
                            DropdownMenuItem(
                                text = {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = if (sortState.order == SortOrder.ASCENDING) {
                                                Icons.Default.ArrowUpward
                                            } else {
                                                Icons.Default.ArrowDownward
                                            },
                                            contentDescription = null,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(sortState.order.label)
                                    }
                                },
                                onClick = {
                                    screenModel.toggleSortOrder()
                                }
                            )
                        }
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            if (showScrollToTop) {
                FloatingActionButton(
                    onClick = {
                        coroutineScope.launch {
                            listState.animateScrollToItem(0)
                        }
                    }
                ) {
                    Icon(
                        imageVector = Icons.Default.KeyboardArrowUp,
                        contentDescription = "Scroll to top"
                    )
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Status row: sync status + works count
            val countText = if (filterState.hasActiveFilters) {
                "${works.size} of $totalWorksCount works"
            } else {
                "$totalWorksCount works"
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = if (syncState.isSyncing || syncState.lastSyncedAt != null) {
                    Arrangement.SpaceBetween
                } else {
                    Arrangement.Center
                },
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Left side: sync status
                if (syncState.isSyncing) {
                    Row(
                        modifier = Modifier.weight(1f)
                            .clickable(role = Role.Button, onClickLabel = "Show sync debug progress") { showSyncDebug = true }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = syncState.statusMessage ?: "Syncing...",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                } else {
                    syncState.lastSyncedAt?.let { lastSync ->
                        Row(
                            modifier = Modifier.clickable(role = Role.Button, onClickLabel = "Show sync debug progress") { showSyncDebug = true }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Sync,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = formatSyncTimestamp(lastSync),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Right side: works count
                Text(
                    text = countText,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (filterState.hasActiveFilters)
                        MaterialTheme.colorScheme.primary
                    else
                        MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Sync error indicator
            syncState.error?.let { error ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button, onClickLabel = "Show sync debug progress") { showSyncDebug = true }
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Sync error: $error",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            // Search bar
            OutlinedTextField(
                value = filterState.searchQuery,
                onValueChange = { screenModel.updateSearchQuery(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                placeholder = { Text("Search by title or author") },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null)
                },
                trailingIcon = {
                    if (filterState.searchQuery.isNotBlank()) {
                        IconButton(onClick = { screenModel.updateSearchQuery("") }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear")
                        }
                    }
                },
                singleLine = true
            )

            // Active filters indicator
            if (filterState.hasActiveFilters) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Filters active",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                    TextButton(onClick = { screenModel.clearAllFilters() }) {
                        Text("Clear all")
                    }
                }
            }

            // Works list
            if (works.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (filterState.hasActiveFilters) {
                            "No works match your filters"
                        } else {
                            "No tracked works yet.\nVisit AO3 in the Read tab to start tracking!"
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(works, key = { it.id }) { work ->
                        WorkCard(
                            work = work,
                            onClick = {
                                // Navigate to Read tab with the last read chapter or work URL
                                val lastChapter = work.lastChapterRead
                                val url = if (lastChapter != null) {
                                    "https://archiveofourown.org/works/${work.id}/chapters/${lastChapter.id}"
                                } else {
                                    "https://archiveofourown.org/works/${work.id}"
                                }
                                val scrollProgress = lastChapter?.readProgress ?: 0f
                                NavigationState.navigateToRead(url, scrollProgress)
                                tabNavigator.current = ReadTab
                            },
                            onFavourite = { screenModel.toggleFavourite(work.id, work.favourite) },
                            onDetails = { navigator.push(WorkDetailScreen(work.id)) }
                        )
                    }
                }
            }
        }

        if (showSyncDebug) {
            SyncDebugDialog(syncState = syncState, onDismiss = { showSyncDebug = false })
        }

        // Filter bottom sheet
        if (isFilterSheetVisible) {
            ModalBottomSheet(
                onDismissRequest = { screenModel.hideFilterSheet() },
                sheetState = sheetState
            ) {
                FilterSheetContent(
                    screenModel = screenModel,
                    filterState = filterState
                )
            }
        }
    }
}

@Composable
internal fun WorkCard(
    work: Work,
    onClick: () -> Unit,
    onFavourite: () -> Unit,
    onDetails: () -> Unit
) {
    val lastChapter = work.lastChapterRead

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (work.isPrivate && work.title == null) "Private work" else work.title ?: "Unknown Work",
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        color = if (work.isPrivate && work.title == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
                    )
                    if (!(work.isPrivate && work.author == null)) {
                        Text(
                            text = "by ${work.author ?: "Anonymous"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    work.tags.firstOrNull { it.type == TagType.FANDOM }?.let { fandom ->
                        Text(
                            text = fandom.tag,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Row {
                    IconButton(onClick = onFavourite) {
                        Icon(
                            imageVector = if (work.favourite) Icons.Default.Star else Icons.Default.StarBorder,
                            contentDescription = if (work.favourite) "Remove from favourites" else "Add to favourites",
                            tint = if (work.favourite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onDetails) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = "Details",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Current chapter info
            lastChapter?.let { chapter ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Reading: ${chapter.displayTitle}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "${chapter.progressPercent}%",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            ChapterProgressBar(work)

            Spacer(modifier = Modifier.height(4.dp))

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = "Chapters: ${work.chapterProgress}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                work.lastUpdated?.let { lastUpdatedTimestamp ->
                    Text(
                        text = "Updated: ${formatWorkTimestamp(lastUpdatedTimestamp)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                work.lastRead?.let { lastReadTimestamp ->
                    Text(
                        text = "Read: ${formatWorkTimestamp(lastReadTimestamp)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun FilterSheetContent(
    screenModel: TrackScreenModel,
    filterState: FilterState
) {
    val ratings by screenModel.availableRatings.collectAsState()
    val warnings by screenModel.availableWarnings.collectAsState()
    val categories by screenModel.availableCategories.collectAsState()
    val fandoms by screenModel.availableFandoms.collectAsState()
    val relationships by screenModel.availableRelationships.collectAsState()
    val characters by screenModel.availableCharacters.collectAsState()
    val freeformTags by screenModel.availableFreeformTags.collectAsState()

    // Use persisted search query from screen model
    val searchQuery by screenModel.filterTagSearchQuery.collectAsState()
    val expandedSections by screenModel.expandedFilterSections.collectAsState()

    // Subscribe so favourite changes recompose the chips
    val favouriteTagFilters by screenModel.favouriteTagFilters.collectAsState()
    val isFavourite: (TagType, String) -> Boolean = { tagType, tag ->
        "${tagType.id}\t$tag" in favouriteTagFilters
    }

    // Filter options based on search query, but always include items with active filter modes
    fun filterOptions(options: List<String>, filters: Map<String, TagFilterMode>): List<String> {
        if (searchQuery.isBlank()) return options
        val query = searchQuery.lowercase()
        return options.filter { option ->
            option in filters || option.lowercase().contains(query)
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth()
    ) {
        // Search bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { screenModel.updateFilterTagSearchQuery(it) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            placeholder = { Text("Search tags...") },
            leadingIcon = {
                Icon(Icons.Default.Search, contentDescription = null)
            },
            trailingIcon = {
                if (searchQuery.isNotBlank()) {
                    IconButton(onClick = { screenModel.updateFilterTagSearchQuery("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear")
                    }
                }
            },
            singleLine = true
        )

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Text(
                    text = "Filters",
                    style = MaterialTheme.typography.headlineSmall
                )
            }

            val visibleFavourites = parseFavouriteKeys(favouriteTagFilters, searchQuery)
            if (visibleFavourites.isNotEmpty()) {
                item {
                    FavouriteTagsFilterSection(
                        favourites = visibleFavourites,
                        filterState = filterState,
                        expanded = FilterSection.FAVOURITES in expandedSections,
                        onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.FAVOURITES) },
                        onToggleFilter = { tagType, tag -> screenModel.toggleTagFilter(tagType, tag) },
                        onToggleFavourite = { tagType, tag -> screenModel.toggleFavouriteTag(tagType, tag) }
                    )
                }
            }

            // Reading Status filter section (always show)
            item {
                ReadingStatusFilterSection(
                    filters = filterState.readingStatusFilters,
                    onToggle = { screenModel.toggleReadingStatus(it) },
                    expanded = FilterSection.READING_STATUS in expandedSections,
                    onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.READING_STATUS) }
                )
            }

            val filteredRatings = filterOptions(ratings, filterState.ratingFilters)
            if (filteredRatings.isNotEmpty()) {
                item {
                    TagFilterSection(
                        title = "Rating",
                        options = filteredRatings,
                        filters = filterState.ratingFilters,
                        onToggle = { screenModel.toggleRating(it) },
                        expanded = FilterSection.RATING in expandedSections,
                        onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.RATING) },
                        isFavourite = { isFavourite(TagType.RATING, it) },
                        onLongClick = { screenModel.toggleFavouriteTag(TagType.RATING, it) }
                    )
                }
            }

            val filteredWarnings = filterOptions(warnings, filterState.warningFilters)
            if (filteredWarnings.isNotEmpty()) {
                item {
                    TagFilterSection(
                        title = "Warning",
                        options = filteredWarnings,
                        filters = filterState.warningFilters,
                        onToggle = { screenModel.toggleWarning(it) },
                        expanded = FilterSection.WARNING in expandedSections,
                        onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.WARNING) },
                        isFavourite = { isFavourite(TagType.WARNING, it) },
                        onLongClick = { screenModel.toggleFavouriteTag(TagType.WARNING, it) }
                    )
                }
            }

            val filteredCategories = filterOptions(categories, filterState.categoryFilters)
            if (filteredCategories.isNotEmpty()) {
                item {
                    TagFilterSection(
                        title = "Category",
                        options = filteredCategories,
                        filters = filterState.categoryFilters,
                        onToggle = { screenModel.toggleCategory(it) },
                        expanded = FilterSection.CATEGORY in expandedSections,
                        onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.CATEGORY) },
                        isFavourite = { isFavourite(TagType.CATEGORY, it) },
                        onLongClick = { screenModel.toggleFavouriteTag(TagType.CATEGORY, it) }
                    )
                }
            }

            val filteredFandoms = filterOptions(fandoms, filterState.fandomFilters)
            if (filteredFandoms.isNotEmpty()) {
                item {
                    TagFilterSection(
                        title = "Fandom",
                        options = filteredFandoms,
                        filters = filterState.fandomFilters,
                        onToggle = { screenModel.toggleFandom(it) },
                        expanded = FilterSection.FANDOM in expandedSections,
                        onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.FANDOM) },
                        isFavourite = { isFavourite(TagType.FANDOM, it) },
                        onLongClick = { screenModel.toggleFavouriteTag(TagType.FANDOM, it) }
                    )
                }
            }

            val filteredRelationships = filterOptions(relationships, filterState.relationshipFilters)
            if (filteredRelationships.isNotEmpty()) {
                item {
                    TagFilterSection(
                        title = "Relationship",
                        options = filteredRelationships,
                        filters = filterState.relationshipFilters,
                        onToggle = { screenModel.toggleRelationship(it) },
                        expanded = FilterSection.RELATIONSHIP in expandedSections,
                        onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.RELATIONSHIP) },
                        isFavourite = { isFavourite(TagType.RELATIONSHIP, it) },
                        onLongClick = { screenModel.toggleFavouriteTag(TagType.RELATIONSHIP, it) }
                    )
                }
            }

            val filteredCharacters = filterOptions(characters, filterState.characterFilters)
            if (filteredCharacters.isNotEmpty()) {
                item {
                    TagFilterSection(
                        title = "Character",
                        options = filteredCharacters,
                        filters = filterState.characterFilters,
                        onToggle = { screenModel.toggleCharacter(it) },
                        expanded = FilterSection.CHARACTER in expandedSections,
                        onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.CHARACTER) },
                        isFavourite = { isFavourite(TagType.CHARACTER, it) },
                        onLongClick = { screenModel.toggleFavouriteTag(TagType.CHARACTER, it) }
                    )
                }
            }

            val filteredFreeformTags = filterOptions(freeformTags, filterState.freeformFilters)
            if (filteredFreeformTags.isNotEmpty()) {
                item {
                    TagFilterSection(
                        title = "Additional Tags",
                        options = filteredFreeformTags,
                        filters = filterState.freeformFilters,
                        onToggle = { screenModel.toggleFreeformTag(it) },
                        expanded = FilterSection.FREEFORM in expandedSections,
                        onExpandedChange = { screenModel.toggleFilterSectionExpanded(FilterSection.FREEFORM) },
                        isFavourite = { isFavourite(TagType.FREEFORM, it) },
                        onLongClick = { screenModel.toggleFavouriteTag(TagType.FREEFORM, it) }
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }
}

/**
 * Cross-type favourites section pinned to the top of the filter sheet.
 * Each chip dispatches its tap to the underlying per-type filter map, so
 * filter state stays in one place. Long-press unfavourites the tag.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FavouriteTagsFilterSection(
    favourites: List<Pair<TagType, String>>,
    filterState: FilterState,
    expanded: Boolean,
    onExpandedChange: () -> Unit,
    onToggleFilter: (TagType, String) -> Unit,
    onToggleFavourite: (TagType, String) -> Unit
) {
    val activeCount = favourites.count { (tagType, tag) ->
        filterModeFor(filterState, tagType, tag) != TagFilterMode.DEFAULT
    }

    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onExpandedChange() }
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Star,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = "Favourites",
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = if (activeCount > 0) "($activeCount/${favourites.size})" else "(${favourites.size})",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (activeCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Icon(
                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(24.dp)
            )
        }

        AnimatedVisibility(visible = expanded) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 8.dp)
            ) {
                favourites.forEach { (tagType, tag) ->
                    TriStateFilterChip(
                        mode = filterModeFor(filterState, tagType, tag),
                        onClick = { onToggleFilter(tagType, tag) },
                        label = tag,
                        isFavourite = true,
                        onLongClick = { onToggleFavourite(tagType, tag) }
                    )
                }
            }
        }
    }
}

private fun filterModeFor(state: FilterState, tagType: TagType, tag: String): TagFilterMode {
    val map = when (tagType) {
        TagType.RATING -> state.ratingFilters
        TagType.WARNING -> state.warningFilters
        TagType.CATEGORY -> state.categoryFilters
        TagType.FANDOM -> state.fandomFilters
        TagType.RELATIONSHIP -> state.relationshipFilters
        TagType.CHARACTER -> state.characterFilters
        TagType.FREEFORM -> state.freeformFilters
        TagType.UNKNOWN -> return TagFilterMode.DEFAULT
    }
    return map[tag] ?: TagFilterMode.DEFAULT
}

/**
 * Decode the `"${tagType.id}\t$tag"` key set into typed pairs, filter by the
 * shared search query, and sort by tag type then tag name so similar tags
 * cluster together.
 */
private fun parseFavouriteKeys(
    favouriteKeys: Set<String>,
    searchQuery: String
): List<Pair<TagType, String>> {
    val parsed = favouriteKeys.mapNotNull { key ->
        val sep = key.indexOf('\t')
        if (sep <= 0) return@mapNotNull null
        val typeId = key.substring(0, sep).toIntOrNull() ?: return@mapNotNull null
        val tagType = TagType.fromId(typeId)
        if (tagType == TagType.UNKNOWN) return@mapNotNull null
        tagType to key.substring(sep + 1)
    }.sortedWith(compareBy({ it.first.id }, { it.second.lowercase() }))

    if (searchQuery.isBlank()) return parsed
    val q = searchQuery.lowercase()
    return parsed.filter { (_, tag) -> tag.lowercase().contains(q) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagFilterSection(
    title: String,
    options: List<String>,
    filters: Map<String, TagFilterMode>,
    onToggle: (String) -> Unit,
    expanded: Boolean,
    onExpandedChange: () -> Unit,
    isFavourite: (String) -> Boolean = { false },
    onLongClick: ((String) -> Unit)? = null
) {
    val activeCount = options.count { filters[it] != null && filters[it] != TagFilterMode.DEFAULT }
    val sortedOptions = remember(options, isFavourite) {
        // Pinned favourites first; otherwise preserve incoming order.
        options.sortedByDescending { isFavourite(it) }
    }

    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onExpandedChange() }
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = if (activeCount > 0) "($activeCount/${options.size})" else "(${options.size})",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (activeCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Icon(
                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(24.dp)
            )
        }

        AnimatedVisibility(visible = expanded) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 8.dp)
            ) {
                sortedOptions.forEach { option ->
                    val filterMode = filters[option] ?: TagFilterMode.DEFAULT
                    TriStateFilterChip(
                        mode = filterMode,
                        onClick = { onToggle(option) },
                        label = option,
                        isFavourite = isFavourite(option),
                        onLongClick = onLongClick?.let { handler -> { handler(option) } }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TriStateFilterChip(
    mode: TagFilterMode,
    onClick: () -> Unit,
    label: String,
    onLongClick: (() -> Unit)? = null,
    isFavourite: Boolean = false
) {
    val containerColor = when (mode) {
        TagFilterMode.DEFAULT -> MaterialTheme.colorScheme.surface
        TagFilterMode.INCLUDE -> MaterialTheme.colorScheme.primaryContainer
        TagFilterMode.EXCLUDE -> MaterialTheme.colorScheme.errorContainer
    }
    val labelColor = when (mode) {
        TagFilterMode.DEFAULT -> MaterialTheme.colorScheme.onSurface
        TagFilterMode.INCLUDE -> MaterialTheme.colorScheme.onPrimaryContainer
        TagFilterMode.EXCLUDE -> MaterialTheme.colorScheme.onErrorContainer
    }
    val borderColor = when (mode) {
        TagFilterMode.DEFAULT -> MaterialTheme.colorScheme.outline
        TagFilterMode.INCLUDE -> MaterialTheme.colorScheme.primary
        TagFilterMode.EXCLUDE -> MaterialTheme.colorScheme.error
    }

    Surface(
        color = containerColor,
        contentColor = labelColor,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, borderColor),
        modifier = Modifier.combinedClickable(
            onClick = onClick,
            onLongClick = onLongClick
        )
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        ) {
            if (isFavourite) {
                Icon(
                    imageVector = Icons.Default.Star,
                    contentDescription = null,
                    tint = labelColor,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
            }
            Text(
                text = when (mode) {
                    TagFilterMode.EXCLUDE -> "✗ $label"
                    else -> label
                },
                color = labelColor,
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReadingStatusFilterSection(
    filters: Map<ReadingStatus, TagFilterMode>,
    onToggle: (ReadingStatus) -> Unit,
    expanded: Boolean,
    onExpandedChange: () -> Unit
) {
    val activeCount = filters.count { it.value != TagFilterMode.DEFAULT }

    val statusLabels = mapOf(
        ReadingStatus.NOT_STARTED to "Not Started",
        ReadingStatus.IN_PROGRESS to "In Progress",
        ReadingStatus.CAUGHT_UP to "Caught Up",
        ReadingStatus.FINISHED to "Finished",
        ReadingStatus.HAS_NEW_CHAPTERS to "Has New Chapters",
        ReadingStatus.PRIVATE to "Private Work",
        ReadingStatus.WORK_COMPLETED to "Work Completed"
    )

    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onExpandedChange() }
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Reading Status",
                    style = MaterialTheme.typography.titleMedium
                )
                if (activeCount > 0) {
                    Text(
                        text = "($activeCount)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
            Icon(
                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(24.dp)
            )
        }

        AnimatedVisibility(visible = expanded) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 8.dp)
            ) {
                ReadingStatus.entries.forEach { status ->
                    val filterMode = filters[status] ?: TagFilterMode.DEFAULT
                    TriStateFilterChip(
                        mode = filterMode,
                        onClick = { onToggle(status) },
                        label = statusLabels[status] ?: status.name
                    )
                }
            }
        }
    }
}

private fun Int.formatWithCommas(): String {
    return this.toString().reversed().chunked(3).joinToString(",").reversed()
}

@OptIn(kotlin.time.ExperimentalTime::class)
internal fun formatWorkTimestamp(
    timestamp: Long,
    now: Long = kotlin.time.Clock.System.now().toEpochMilliseconds()
): String {
    val diff = now - timestamp
    val minutes = diff / (1000 * 60)
    val hours = minutes / 60
    val days = hours / 24

    return when {
        minutes < 1 -> "Just now"
        minutes < 60 -> "$minutes min ago"
        hours == 1L -> "1 hour ago"
        hours < 24 -> "$hours hours ago"
        days == 1L -> "1 day ago"
        else -> "$days days ago"
    }
}

@OptIn(kotlin.time.ExperimentalTime::class)
private fun formatSyncTimestamp(iso8601: String): String {
    return try {
        val instant = kotlin.time.Instant.parse(iso8601)
        val timestamp = instant.toEpochMilliseconds()
        val now = kotlin.time.Clock.System.now().toEpochMilliseconds()
        val diff = now - timestamp
        val minutes = diff / (1000 * 60)
        val hours = minutes / 60
        val days = hours / 24

        when {
            minutes < 1 -> "Just now"
            minutes < 60 -> "$minutes min ago"
            hours < 24 -> "$hours hours ago"
            days < 7 -> "$days days ago"
            else -> iso8601.substringBefore("T")
        }
    } catch (e: Exception) {
        iso8601.substringBefore("T")
    }
}
