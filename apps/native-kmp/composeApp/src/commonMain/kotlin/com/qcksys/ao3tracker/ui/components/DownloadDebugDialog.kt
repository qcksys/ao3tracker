package com.qcksys.ao3tracker.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.offline.DownloadDebugEntry
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.offline.OfflineWorkStatus
import com.qcksys.ao3tracker.data.offline.offlineJson
import kotlin.time.Instant

@Composable
internal fun DownloadDebugDialog(coordinator: OfflineCoordinator, workId: Long, onDismiss: () -> Unit) {
    val entries by coordinator.debugEntries.collectAsState()
    val downloads by coordinator.downloads.collectAsState()
    val network by coordinator.network.collectAsState()
    val foreground by coordinator.isForeground.collectAsState()
    val cooldown by coordinator.gate.cooldown.collectAsState()
    DownloadDebugContent(downloads.firstOrNull { it.work.workId == workId }, entries,
        "${if (network.connected) "Connected" else "Offline"} · ${if (network.wifi) "Wi-Fi" else "Other network"} · ${if (foreground) "App active" else "App in background"}",
        cooldown, onDismiss)
}

@Composable
internal fun DownloadDebugContent(status: OfflineWorkStatus?, entries: List<DownloadDebugEntry>, connection: String,
    cooldown: Long, onDismiss: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Download debug progress") }, text = {
        SelectionContainer {
            Column(Modifier.fillMaxWidth().heightIn(max = 400.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(connection)
                status?.let { download ->
                    Text("${download.savedChapterIds.size} of ${download.publishedChapters} chapters saved")
                    download.job?.let { job ->
                        Text("${job.mode} · ${job.state} · ${job.attempts} failed attempts")
                        Text("Remaining chapters: ${offlineJson.decodeFromString<List<String>>(job.remainingJson).size}")
                        if (job.retryAt > 0) Text("Retry at: ${Instant.fromEpochMilliseconds(job.retryAt)}")
                        job.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    }
                    download.snapshots.forEach { chapter ->
                        Text("Chapter ${download.chapters.firstOrNull { it.id == chapter.chapterId.toString() }?.number ?: chapter.chapterId}: download revision ${chapter.downloadUpdatedAt ?: "unknown"}", style = MaterialTheme.typography.bodySmall)
                    }
                }
                if (cooldown > 0) Text("AO3 cooldown until: ${Instant.fromEpochMilliseconds(cooldown)}")
                HorizontalDivider()
                Text("Latest 100 steps · Newest first · UTC", style = MaterialTheme.typography.labelSmall)
                if (entries.isEmpty()) Text("No download details yet. Start a download to see progress.")
                entries.asReversed().forEach { entry ->
                    Column {
                        Text(entry.timestamp, style = MaterialTheme.typography.labelSmall)
                        Text(entry.message, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }, confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } })
}
