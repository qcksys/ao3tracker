package com.qcksys.ao3tracker.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.offline.OfflineWorkStatus
import com.qcksys.ao3tracker.data.offline.offlineWorkStatusText
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import org.koin.compose.koinInject

@Composable
internal fun OfflineWorkCard(workId: Long) {
    val coordinator = koinInject<OfflineCoordinator>()
    if (!coordinator.enabled) return
    val downloads by coordinator.downloads.collectAsState()
    var showDebug by remember(workId) { mutableStateOf(false) }
    if (showDebug) DownloadDebugDialog(coordinator, workId) { showDebug = false }
    OfflineWorkCardContent(
        workId = workId,
        download = downloads.firstOrNull { it.work.workId == workId },
        onSave = { update -> coordinator.saveWork(workId, update) },
        onRetry = { coordinator.retry(workId) },
        onRemove = { coordinator.remove(workId) },
        onShowDebug = { showDebug = true },
        onOpenLive = {
            coordinator.retry(workId)
            NavigationState.navigateToLiveWork(workId)
        }
    )
}

@Composable
internal fun OfflineWorkCardContent(
    workId: Long,
    download: OfflineWorkStatus?,
    onSave: (update: Boolean) -> Unit,
    onRetry: () -> Unit,
    onRemove: () -> Unit,
    onShowDebug: () -> Unit,
    onOpenLive: () -> Unit
) {
    var expanded by rememberSaveable(workId) { mutableStateOf(false) }
    val status = offlineWorkStatusText(download)
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth()
                .semantics {
                    heading()
                    stateDescription = if (expanded) "Expanded" else "Collapsed"
                }
                .clickable(
                    role = Role.Button,
                    onClickLabel = if (expanded) "Collapse offline reading" else "Expand offline reading",
                    onClick = { expanded = !expanded }
                )
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Offline reading", style = MaterialTheme.typography.titleMedium)
                Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, contentDescription = null)
        }
        if (download?.job?.state == "queued") {
            TextButton(onClick = onOpenLive, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Open on AO3") }
        }
        if (expanded) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (download == null) Text("Keep this work and its AO3 site skin on this device.")
                else {
                    TextButton(onClick = onShowDebug) {
                        Text("${download.savedChapterIds.size} of ${download.publishedChapters} published chapters saved")
                    }
                    val knownChapters = download.savedChapterIds.intersect(download.chapters.map { it.id }.toSet()).size
                    if (download.publishedChapters > download.chapters.size) Text("New chapters are available. Update saved work to download them.")
                    else if (knownChapters < download.chapters.size) Text("Some chapters still need to download.")
                    download.chapters.firstOrNull { it.id in download.savedChapterIds }?.let { chapter ->
                        TextButton(onClick = { NavigationState.navigateToRead(chapter.url, 0f) }) { Text("Read saved chapters") }
                    }
                }
                TextButton(onClick = { onSave(download != null) }) {
                    Text(if (download == null) "Save whole work" else "Update saved work")
                }
                if (download?.job?.state == "failed") TextButton(onClick = onRetry) { Text("Retry download") }
                if (download != null) TextButton(onClick = onRemove) { Text("Remove download") }
            }
        }
    }
}
