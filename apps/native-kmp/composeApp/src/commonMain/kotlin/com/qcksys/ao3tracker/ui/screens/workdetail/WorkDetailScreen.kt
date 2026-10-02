package com.qcksys.ao3tracker.ui.screens.workdetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import cafe.adriel.voyager.navigator.tab.LocalTabNavigator
import com.qcksys.ao3tracker.data.model.Chapter
import com.qcksys.ao3tracker.data.model.Tag
import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.data.model.Work
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import com.qcksys.ao3tracker.ui.navigation.ReadTab
import com.qcksys.ao3tracker.ui.navigation.TrackTab
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.koin.compose.koinInject

data class WorkDetailScreen(val workId: Long) : Screen {
    @Composable
    override fun Content() {
        val repository = koinInject<com.qcksys.ao3tracker.data.repository.Ao3Repository>()
        val screenModel = remember { WorkDetailScreenModel(workId, repository) }
        WorkDetailContent(screenModel)
    }
}

@OptIn(ExperimentalMaterial3Api::class, kotlinx.serialization.ExperimentalSerializationApi::class)
@Composable
private fun WorkDetailContent(screenModel: WorkDetailScreenModel) {
    val navigator = LocalNavigator.currentOrThrow
    val tabNavigator = LocalTabNavigator.current
    val work by screenModel.work.collectAsState()
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showDebugDialog by remember { mutableStateOf(false) }

    // JSON formatter for debug output
    val jsonFormatter = remember {
        Json {
            prettyPrint = true
            prettyPrintIndent = "  "
        }
    }

    // Function to navigate to Read tab with URL and scroll position
    fun navigateToRead(url: String, scrollProgress: Float) {
        NavigationState.navigateToRead(url, scrollProgress)
        NavigationState.popTrackTabToRoot()
        tabNavigator.current = ReadTab
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Work Details") },
                navigationIcon = {
                    IconButton(onClick = { navigator.pop() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                actions = {
                    work?.let { workData ->
                        IconButton(onClick = { navigateToRead(buildWorkUrl(workData.id), 0f) }) {
                            Icon(
                                imageVector = Icons.Default.OpenInBrowser,
                                contentDescription = "Open in Read tab"
                            )
                        }
                        IconButton(onClick = { navigateToRead(buildChapterIndexUrl(workData.id), 0f) }) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.List,
                                contentDescription = "View chapter index"
                            )
                        }
                        IconButton(onClick = { showDebugDialog = true }) {
                            Icon(
                                imageVector = Icons.Default.Code,
                                contentDescription = "Debug JSON"
                            )
                        }
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Delete",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        work?.let { workData ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Work info card
                item {
                    WorkInfoCard(
                        work = workData,
                        onMarkAsRead = { screenModel.markWorkAsRead() },
                        onMarkAsUnread = { screenModel.markWorkAsUnread() },
                        onToggleSubscription = { screenModel.toggleSubscription() },
                        onToggleFavourite = { screenModel.toggleFavourite() }
                    )
                }

                // Tags section
                if (workData.tags.isNotEmpty()) {
                    item {
                        TagsSection(
                            tags = workData.tags,
                            onTagClick = { tagType, tag ->
                                NavigationState.navigateToTrackWithTag(tagType, tag)
                                NavigationState.popTrackTabToRoot()
                                tabNavigator.current = TrackTab
                            }
                        )
                    }
                }

                // Chapters section
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Chapters",
                            style = MaterialTheme.typography.titleMedium
                        )
                        if (workData.chapterList.isNotEmpty()) {
                            val readChapters = workData.chapterList.count {
                                (it.readProgress ?: 0f) > 0f
                            }
                            Text(
                                text = "$readChapters/${workData.chapterList.size} read",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                if (workData.chapterList.isEmpty()) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Text(
                                text = "No chapters tracked yet. Visit the work's chapter index page to load all chapters.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(16.dp)
                            )
                        }
                    }
                } else {
                    items(workData.chapterList.sortedBy { it.number }) { chapter ->
                        ChapterCard(
                            chapter = chapter,
                            onClick = { navigateToRead(buildChapterUrl(workData.id, chapter.id), chapter.readProgress ?: 0f) },
                            onMarkAsRead = { screenModel.markChapterAsRead(chapter.id) },
                            onMarkAsUnread = { screenModel.markChapterAsUnread(chapter.id) }
                        )
                    }
                }
            }
        } ?: run {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
    }

    // Delete work dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete Work") },
            text = { Text("Are you sure you want to delete this work and all its reading progress?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        screenModel.deleteWork()
                        showDeleteDialog = false
                        navigator.pop()
                    }
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Debug JSON dialog
    if (showDebugDialog) {
        work?.let { workData ->
            val jsonString = remember(workData) {
                try {
                    jsonFormatter.encodeToString(workData)
                } catch (e: Exception) {
                    "Error encoding to JSON: ${e.message}"
                }
            }

            AlertDialog(
                onDismissRequest = { showDebugDialog = false },
                title = { Text("Debug: Work JSON") },
                text = {
                    SelectionContainer {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(400.dp)
                                .verticalScroll(rememberScrollState())
                                .horizontalScroll(rememberScrollState())
                        ) {
                            Text(
                                text = jsonString,
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                            )
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showDebugDialog = false }) {
                        Text("Close")
                    }
                }
            )
        }
    }
}

@Composable
private fun WorkInfoCard(
    work: Work,
    onMarkAsRead: () -> Unit,
    onMarkAsUnread: () -> Unit,
    onToggleSubscription: () -> Unit,
    onToggleFavourite: () -> Unit
) {
    val isComplete = work.readProgress >= 0.95f
    val hasProgress = work.readProgress > 0f

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = if (work.isPrivate && work.title == null) "Private work" else work.title ?: "Unknown Work",
                style = MaterialTheme.typography.headlineSmall,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                color = if (work.isPrivate && work.title == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
            )
            if (!(work.isPrivate && work.author == null)) {
                Text(
                    text = "by ${work.author ?: "Anonymous"}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            // Language
            work.language?.let { language ->
                Text(
                    text = language,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Progress
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                LinearProgressIndicator(
                    progress = { work.readProgress },
                    modifier = Modifier.weight(1f),
                    drawStopIndicator = {}
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "${(work.readProgress * 100).toInt()}%",
                    style = MaterialTheme.typography.bodySmall
                )
            }

            // Mark as Read / Unread buttons
            if (work.chapterList.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (!isComplete) {
                        Button(
                            onClick = onMarkAsRead,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Done,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Mark All Read")
                        }
                    }
                    if (hasProgress) {
                        TextButton(
                            onClick = onMarkAsUnread,
                            modifier = if (!isComplete) Modifier else Modifier.fillMaxWidth()
                        ) {
                            Icon(
                                imageVector = Icons.Default.Clear,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Mark All Unread")
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Favourite toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (work.favourite) Icons.Default.Star else Icons.Default.StarBorder,
                        contentDescription = null,
                        tint = if (work.favourite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Favourite",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                Switch(
                    checked = work.favourite,
                    onCheckedChange = { onToggleFavourite() }
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Notification subscription toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (work.subscribed) Icons.Default.Notifications else Icons.Default.NotificationsNone,
                        contentDescription = null,
                        tint = if (work.subscribed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Notify on updates",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                Switch(
                    checked = work.subscribed,
                    onCheckedChange = { onToggleSubscription() }
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem("Chapters", work.chapterProgress)
                StatItem("Words", work.wordCountFormatted)
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Engagement stats
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem("Kudos", work.kudosFormatted)
                StatItem("Hits", work.hitsFormatted)
                StatItem("Bookmarks", work.bookmarksFormatted)
                StatItem("Comments", work.commentsFormatted)
            }

            // Summary
            work.summary?.let { summary ->
                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                Text(
                    text = "Summary",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = summary,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 5,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }

            // Last read
            work.lastRead?.let { lastRead ->
                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                Text(
                    text = "Last read: ${formatTimestamp(lastRead)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun StatItem(label: String, value: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagsSection(
    tags: List<Tag>,
    onTagClick: (TagType, String) -> Unit
) {
    val tagsByType = tags.groupBy { it.type }

    // Order: Rating, Warning, Category, Fandom, Relationship, Character, Freeform
    val orderedTypes = listOf(
        TagType.RATING, TagType.WARNING, TagType.CATEGORY,
        TagType.FANDOM, TagType.RELATIONSHIP, TagType.CHARACTER, TagType.FREEFORM
    )

    Column {
        Text(
            text = "Tags",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(modifier = Modifier.height(4.dp))

        orderedTypes.forEach { type ->
            tagsByType[type]?.let { typeTags ->
                if (typeTags.isNotEmpty()) {
                    CollapsibleTagCategory(
                        title = type.displayName,
                        tags = typeTags,
                        onTagClick = { tag -> onTagClick(type, tag) }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CollapsibleTagCategory(
    title: String,
    tags: List<Tag>,
    onTagClick: (String) -> Unit,
    defaultExpanded: Boolean = false
) {
    var expanded by remember { mutableStateOf(defaultExpanded) }

    Column(modifier = Modifier.padding(vertical = 2.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "(${tags.size})",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }
            Icon(
                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp)
            )
        }

        AnimatedVisibility(visible = expanded) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy((-8).dp),
                modifier = Modifier.padding(bottom = 4.dp)
            ) {
                tags.forEach { tag ->
                    AssistChip(
                        onClick = { onTagClick(tag.tag) },
                        label = { Text(tag.tag, style = MaterialTheme.typography.bodySmall) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ChapterCard(
    chapter: Chapter,
    onClick: () -> Unit,
    onMarkAsRead: () -> Unit,
    onMarkAsUnread: () -> Unit
) {
    val progress = chapter.readProgress ?: 0f
    val hasStarted = progress > 0f
    val isComplete = chapter.isComplete

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        colors = CardDefaults.cardColors(
            containerColor = when {
                isComplete -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                hasStarted -> MaterialTheme.colorScheme.surface
                else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            }
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = chapter.displayTitle,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (hasStarted) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = when {
                                isComplete -> "Completed"
                                hasStarted -> "${chapter.progressPercent}%"
                                else -> "Not started"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = when {
                                isComplete -> MaterialTheme.colorScheme.primary
                                hasStarted -> MaterialTheme.colorScheme.onSurfaceVariant
                                else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                            }
                        )
                        chapter.lastReadAt?.let { lastRead ->
                            Text(
                                text = formatTimestamp(lastRead),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Mark as read button (only show if not complete)
                if (!isComplete) {
                    IconButton(onClick = onMarkAsRead) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = "Mark as read",
                            modifier = Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                // Mark as unread button (only show if has progress)
                if (hasStarted) {
                    IconButton(onClick = onMarkAsUnread) {
                        Icon(
                            imageVector = Icons.Default.Clear,
                            contentDescription = "Mark as unread",
                            modifier = Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Progress bar for chapters that have been started
            if (hasStarted) {
                Spacer(modifier = Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                    drawStopIndicator = {}
                )
            }
        }
    }
}

private fun Int.formatWithCommas(): String {
    return this.toString().reversed().chunked(3).joinToString(",").reversed()
}

private fun buildWorkUrl(workId: Long): String {
    return "https://archiveofourown.org/works/$workId"
}

private fun buildChapterIndexUrl(workId: Long): String {
    return "https://archiveofourown.org/works/$workId/navigate"
}

private fun buildChapterUrl(workId: Long, chapterId: Long): String {
    // chapterId = 0 is used for single-chapter works, use work URL instead
    return if (chapterId == 0L) {
        "https://archiveofourown.org/works/$workId"
    } else {
        "https://archiveofourown.org/works/$workId/chapters/$chapterId"
    }
}

@OptIn(kotlin.time.ExperimentalTime::class)
private fun formatTimestamp(timestamp: Long): String {
    // Simple formatting - shows relative time or date
    val now = kotlin.time.Clock.System.now().toEpochMilliseconds()
    val diff = now - timestamp
    val days = diff / (1000 * 60 * 60 * 24)

    return when {
        days < 1 -> "Today"
        days < 2 -> "Yesterday"
        days < 7 -> "$days days ago"
        else -> {
            // Simple date formatting
            val totalSeconds = timestamp / 1000
            val totalMinutes = totalSeconds / 60
            val totalHours = totalMinutes / 60
            val totalDays = totalHours / 24
            val year = 1970 + (totalDays / 365).toInt()
            val dayOfYear = (totalDays % 365).toInt()
            val month = (dayOfYear / 30) + 1
            val day = (dayOfYear % 30) + 1
            "$year-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}"
        }
    }
}
