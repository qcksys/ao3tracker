package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.backup.DriveBackupFile
import com.qcksys.ao3tracker.data.backup.LibraryImportMode
import com.qcksys.ao3tracker.data.model.ExportData

/** A parsed export waiting for the user to choose how to import it into [owner]'s library. */
internal data class PendingLibraryImport(val source: String, val data: ExportData, val owner: String)

private fun LibraryImportMode.label(): String = when (this) {
    LibraryImportMode.MERGE -> "Merge, newer wins"
    LibraryImportMode.ADD_MISSING -> "Add missing works only"
    LibraryImportMode.REPLACE -> "Replace library"
}

private fun LibraryImportMode.description(isTrackerAccount: Boolean): String = when (this) {
    LibraryImportMode.MERGE -> "Adds missing works. For works in both, keeps whichever reading progress is newer. Nothing is deleted."
    LibraryImportMode.ADD_MISSING -> "Works already in this library, including deleted ones, stay as they are."
    LibraryImportMode.REPLACE -> "Removes this library's works first. Favourite tags, saved searches and downloads are kept." +
        if (isTrackerAccount) " Works stored in your tracker account return on the next sync." else ""
}

@Composable
internal fun LibraryImportModeDialog(
    pending: PendingLibraryImport,
    libraryName: String,
    isTrackerAccount: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (LibraryImportMode) -> Unit
) {
    var mode by remember(pending) { mutableStateOf(LibraryImportMode.MERGE) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Import into $libraryName?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${pending.source} contains ${pending.data.works.size} works.",
                    style = MaterialTheme.typography.bodyMedium
                )
                LibraryImportMode.entries.forEach { option ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(selected = option == mode, role = Role.RadioButton, onClick = { mode = option })
                    ) {
                        RadioButton(selected = option == mode, onClick = null)
                        Column(modifier = Modifier.padding(start = 8.dp, top = 4.dp, bottom = 4.dp)) {
                            Text(option.label(), style = MaterialTheme.typography.bodyMedium)
                            Text(
                                option.description(isTrackerAccount),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(mode) },
                colors = if (mode == LibraryImportMode.REPLACE) {
                    ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                } else {
                    ButtonDefaults.buttonColors()
                }
            ) {
                Text(if (mode == LibraryImportMode.REPLACE) "Replace" else "Import")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
internal fun DriveBackupListDialog(
    backups: List<DriveBackupFile>,
    deviceId: String?,
    owner: String?,
    onDismiss: () -> Unit,
    onSelect: (DriveBackupFile) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose a backup") },
        text = {
            LazyColumn(modifier = Modifier.heightIn(max = 400.dp)) {
                items(backups, key = { it.id }) { backup ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(backup) }
                            .padding(vertical = 12.dp)
                    ) {
                        Text(backup.name.removeSuffix(".json"), style = MaterialTheme.typography.bodyMedium)
                        val details = listOfNotNull(
                            backup.modifiedTime?.let { "Saved ${formatLastSyncTime(it)}" },
                            "This device and library".takeIf { backup.deviceId == deviceId && backup.library == owner }
                        )
                        if (details.isNotEmpty()) {
                            Text(
                                details.joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    HorizontalDivider()
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
