package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ImportExport
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.offline.OFFLINE_IMPORT_MIME_TYPES
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.offline.OfflineTransferStatus
import com.qcksys.ao3tracker.ui.components.rememberOpenDocumentLauncher
import org.koin.compose.koinInject

@Composable
internal fun OfflineTransferSettings(onExport: () -> Unit) {
    val coordinator = koinInject<OfflineCoordinator>()
    if (!coordinator.enabled) return
    val downloads by coordinator.downloads.collectAsState()
    val transfer by coordinator.transfer.collectAsState()
    // The picker stays registered outside the section, so collapsing it cannot drop the chosen file.
    val openArchive = rememberOpenDocumentLauncher { document -> document?.let(coordinator::importWorks) }
    OfflineTransferSettingsContent(downloads.count { it.savedChapterIds.isNotEmpty() }, transfer, onExport,
        onImport = { openArchive(OFFLINE_IMPORT_MIME_TYPES) })
}

@Composable
internal fun OfflineTransferSettingsContent(savedWorks: Int, transfer: OfflineTransferStatus, onExport: () -> Unit, onImport: () -> Unit) {
    SettingsSection(
        title = "Export & import",
        summary = transfer.progress ?: "${if (savedWorks == 1) "1 saved work" else "$savedWorks saved works"} · Downloaded works",
        icon = Icons.Default.ImportExport
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Export this AO3 account's downloaded works to keep a copy or move them to another device. " +
                "EPUB books open in e-book apps but cannot be imported.")
            OutlinedButton(onClick = onExport, enabled = savedWorks > 0 && !transfer.running, modifier = Modifier.fillMaxWidth()) {
                Text("Export downloaded works")
            }
            OutlinedButton(onClick = onImport, enabled = !transfer.running, modifier = Modifier.fillMaxWidth()) {
                Text(transfer.progress ?: "Import downloaded works")
            }
            Text("Imported chapters are added to this AO3 account's downloads and kept until you remove them. " +
                "Chapters already saved at the same or a newer revision are kept.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            transfer.message?.let { Text(it) }
        }
    }
}
