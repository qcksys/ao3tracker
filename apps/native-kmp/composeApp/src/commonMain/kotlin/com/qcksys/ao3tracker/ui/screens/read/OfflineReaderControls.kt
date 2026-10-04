package com.qcksys.ao3tracker.ui.screens.read

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import com.qcksys.ao3tracker.data.offline.OpenOfflineChapter
import com.qcksys.ao3tracker.data.offline.offlineLocation
import com.qcksys.ao3tracker.ui.components.DownloadDebugDialog

@Composable
internal fun OfflineReaderControls(
    coordinator: OfflineCoordinator,
    model: ReadScreenModel,
    url: String,
    opened: OpenOfflineChapter?,
    incognito: Boolean
) {
    if (!coordinator.enabled) return
    val location = runCatching { offlineLocation(url) }.getOrNull() ?: return
    val downloads by coordinator.downloads.collectAsState()
    val network by coordinator.network.collectAsState()
    val capture by coordinator.capture.collectAsState()
    val canGoBack by model.canGoBack.collectAsState()
    val canGoForward by model.canGoForward.collectAsState()
    val status = downloads.firstOrNull { it.work.workId.toString() == location.workId }
    val workId = location.workId.toLong()
    var expanded by remember(workId) { mutableStateOf(false) }
    var showDebug by remember(workId) { mutableStateOf(false) }
    if (showDebug) DownloadDebugDialog(coordinator, workId) { showDebug = false }
    val chapters = opened?.document?.page?.chapters ?: status?.chapters.orEmpty()
    val currentId = opened?.document?.page?.chapterId ?: location.chapterId
    val index = chapters.indexOfFirst { it.id == currentId }
    val label = when {
        capture != null -> "Saving chapter…"
        opened != null && !network.connected -> "Offline"
        opened != null -> "Saved copy"
        status?.job?.state == "running" -> "Downloading…"
        status?.job?.state == "queued" -> "Download queued"
        status?.job?.state == "failed" -> "Download needs attention"
        status?.savedChapterIds?.isNotEmpty() == true -> "Available offline"
        else -> "Save offline"
    }
    Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { chapters.getOrNull(index - 1)?.let { model.openSavedOrLive(it.url, 0f) } }, enabled = index > 0) { Text("Previous") }
            TextButton(onClick = {
                if (capture != null || status?.job?.state in setOf("running", "queued", "failed")) showDebug = true else expanded = true
            }) { Text(label) }
            TextButton(onClick = { chapters.getOrNull(index + 1)?.let { model.openSavedOrLive(it.url, 0f) } }, enabled = index >= 0 && index < chapters.lastIndex) { Text("Next") }
        }
    }
    if (expanded) AlertDialog(
        onDismissRequest = { expanded = false },
        title = { Text("Offline reading") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(status?.work?.title ?: "This work")
                if (status != null) TextButton(onClick = { showDebug = true }) {
                    Text("${status.savedChapterIds.size} of ${status.publishedChapters} published chapters saved")
                }
                if (status != null && status.publishedChapters > status.chapters.size) Text("New chapters are available. Update saved work to download them.")
                if (incognito) Text("Saving keeps a copy on this device, including while incognito is on.")
                if (opened?.missingResources?.isNotEmpty() == true) Text("Some images or fonts could not be saved. The appearance may be incomplete.")
                status?.job?.error?.let { Text(it) }
                Text("Downloads continue when you switch apps or lock your phone. Saved copies include the last complete AO3 site skin.")
                if (opened != null) Text("Comments, kudos, subscriptions and searches require a connection. Open this page online to use them.")
                Row {
                    TextButton(onClick = { model.goBack(); expanded = false }, enabled = canGoBack) { Text("Back") }
                    TextButton(onClick = { model.goForward(); expanded = false }, enabled = canGoForward) { Text("Forward") }
                }
                TextButton(onClick = { coordinator.saveWork(workId); expanded = false }, enabled = capture == null) { Text("Save whole work") }
                if (status != null) {
                    TextButton(onClick = { coordinator.saveWork(workId, update = true); expanded = false }) { Text("Update saved work") }
                    if (status.job?.state == "failed") TextButton(onClick = { coordinator.retry(workId); expanded = false }) { Text("Retry download") }
                    TextButton(onClick = { coordinator.remove(workId); expanded = false }) { Text("Remove download") }
                }
                TextButton(onClick = { model.reloadOnline(); expanded = false }) { Text("Open current page online") }
                chapters.forEach { chapter ->
                    val saved = chapter.id in status?.savedChapterIds.orEmpty()
                    TextButton(onClick = { model.openSavedOrLive(chapter.url, 0f); expanded = false }) {
                        Text("${chapter.number}. ${chapter.title} · ${if (saved) "Saved" else "Not saved"}", Modifier.padding(vertical = 2.dp))
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { expanded = false }) { Text("Done") } }
    )
}
