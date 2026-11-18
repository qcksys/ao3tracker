package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.offline.OfflineExportFormat
import com.qcksys.ao3tracker.data.offline.OfflineTransferStatus
import com.qcksys.ao3tracker.data.offline.OfflineWorkStatus
import com.qcksys.ao3tracker.data.offline.offlineExportFile
import com.qcksys.ao3tracker.ui.components.rememberCreateDocumentLauncher
import org.koin.compose.koinInject
import kotlin.time.Clock

/** Exports saved works of the current AO3 account; [workIds] are selected first, or every saved work when null. */
internal data class OfflineExportScreen(val workIds: List<Long>? = null) : Screen {
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    override fun Content() {
        val coordinator = koinInject<OfflineCoordinator>()
        val downloads by coordinator.downloads.collectAsState()
        val transfer by coordinator.transfer.collectAsState()
        val navigator = LocalNavigator.currentOrThrow
        val works = downloads.filter { it.savedChapterIds.isNotEmpty() }
        var selection by rememberSaveable { mutableStateOf(workIds) }
        var format by rememberSaveable { mutableStateOf(OfflineExportFormat.Archive) }
        val chosen = works.filter { selection?.contains(it.work.workId) ?: true }
        val selected = chosen.map { it.work.workId }.toSet()
        // The works named in the file, kept in case the list has not reloaded when the picker returns.
        var exporting by rememberSaveable { mutableStateOf<List<Long>?>(null) }
        val create = rememberCreateDocumentLauncher { document ->
            val workIds = exporting
            exporting = null
            if (document != null && workIds != null) coordinator.exportWorks(workIds.toSet(), format, document)
        }
        Scaffold(topBar = { TopAppBar(title = { Text("Export downloaded works") }, navigationIcon = {
            TextButton(onClick = { navigator.pop() }) { Text("Back") }
        }) }) { padding ->
            OfflineExportContent(works, selected, format, transfer,
                onToggle = { workId -> selection = (if (workId in selected) selected - workId else selected + workId).toList() },
                onSelectAll = { selection = null },
                onClear = { selection = emptyList() },
                onFormat = { format = it },
                onExport = {
                    val (name, mimeType) = offlineExportFile(format, chosen.map { it.work.title }, Clock.System.now().toString().take(10))
                    exporting = selected.toList()
                    create(name, mimeType)
                },
                modifier = Modifier.padding(padding))
        }
    }
}

@Composable
internal fun OfflineExportContent(
    works: List<OfflineWorkStatus>,
    selected: Set<Long>,
    format: OfflineExportFormat,
    transfer: OfflineTransferStatus,
    onToggle: (workId: Long) -> Unit,
    onSelectAll: () -> Unit,
    onClear: () -> Unit,
    onFormat: (OfflineExportFormat) -> Unit,
    onExport: () -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Format", style = MaterialTheme.typography.titleMedium) }
        item {
            ExportFormatOption("App archive", "Import on this or another device. Keeps the saved site skin and images.",
                format == OfflineExportFormat.Archive) { onFormat(OfflineExportFormat.Archive) }
        }
        item {
            ExportFormatOption("EPUB", "Read in e-book apps. One book per work, without the AO3 site skin. EPUB books cannot be imported.",
                format == OfflineExportFormat.Epub) { onFormat(OfflineExportFormat.Epub) }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Works · ${selected.size} of ${works.size} selected", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onSelectAll, enabled = selected.size < works.size) { Text("Select all") }
                TextButton(onClick = onClear, enabled = selected.isNotEmpty()) { Text("Clear") }
            }
        }
        if (works.isEmpty()) item { Text("No works are saved for this AO3 account.") }
        items(works, key = { it.work.workId }) { download ->
            val workId = download.work.workId
            Row(
                Modifier.fillMaxWidth()
                    .toggleable(value = workId in selected, role = Role.Checkbox, onValueChange = { onToggle(workId) })
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(checked = workId in selected, onCheckedChange = null)
                Column(Modifier.padding(start = 12.dp)) {
                    Text(download.work.title, style = MaterialTheme.typography.bodyLarge)
                    Text("${download.savedChapterIds.size} of ${download.publishedChapters} chapters saved",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        transfer.message?.let { message -> item { Text(message) } }
        item {
            Button(onClick = onExport, enabled = selected.isNotEmpty() && !transfer.running, modifier = Modifier.fillMaxWidth()) {
                Text(when {
                    transfer.progress != null -> transfer.progress
                    selected.isEmpty() -> "Choose works to export"
                    selected.size == 1 -> "Export 1 work"
                    else -> "Export ${selected.size} works"
                })
            }
        }
    }
}

@Composable
private fun ExportFormatOption(title: String, description: String, selected: Boolean, onSelect: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectable(selected = selected, role = Role.RadioButton, onClick = onSelect).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = null)
        Column(Modifier.padding(start = 12.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
