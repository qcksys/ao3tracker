package com.qcksys.ao3tracker.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import org.koin.compose.koinInject

@Composable
internal fun OfflineWorkCard(workId: Long) {
    val coordinator = koinInject<OfflineCoordinator>()
    if (!coordinator.enabled) return
    val downloads by coordinator.downloads.collectAsState()
    val download = downloads.firstOrNull { it.work.workId == workId }
    var showDebug by remember(workId) { mutableStateOf(false) }
    if (showDebug) DownloadDebugDialog(coordinator, workId) { showDebug = false }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Offline reading", style = MaterialTheme.typography.titleMedium)
            if (download == null) Text("Keep this work and its AO3 site skin on this device.")
            else {
                TextButton(onClick = { showDebug = true }) {
                    Text("${download.savedChapterIds.size} of ${download.publishedChapters} published chapters saved")
                }
                val knownChapters = download.savedChapterIds.intersect(download.chapters.map { it.id }.toSet()).size
                if (download.publishedChapters > download.chapters.size) Text("New chapters are available. Update saved work to download them.")
                else if (knownChapters < download.chapters.size) Text("Some chapters still need to download.")
                when (download.job?.state) {
                    "running" -> Text("Downloading · continues in the background")
                    "queued" -> Text("Queued · waiting for a connection or retry")
                    "failed" -> Text(download.job.error ?: "Download paused. Open the work in Read, then retry.")
                }
                download.chapters.firstOrNull { it.id in download.savedChapterIds }?.let { chapter ->
                    TextButton(onClick = { NavigationState.navigateToRead(chapter.url, 0f) }) { Text("Read saved chapters") }
                }
            }
            TextButton(onClick = { coordinator.saveWork(workId, update = download != null) }) {
                Text(if (download == null) "Save whole work" else "Update saved work")
            }
            if (download?.job?.state == "failed") TextButton(onClick = { coordinator.retry(workId) }) { Text("Retry download") }
            if (download != null) TextButton(onClick = { coordinator.remove(workId) }) { Text("Remove download") }
        }
    }
}
