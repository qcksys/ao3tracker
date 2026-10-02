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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.model.SyncState

@Composable
fun SyncDebugDialog(syncState: SyncState, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sync debug progress") },
        text = {
            SelectionContainer {
                Column(
                    modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = when {
                            syncState.isSyncing -> syncState.statusMessage ?: "Syncing..."
                            syncState.error != null -> "Sync failed"
                            syncState.debugEntries.isNotEmpty() -> "Sync finished"
                            else -> "Sync idle"
                        },
                        style = MaterialTheme.typography.titleSmall
                    )
                    syncState.error?.let {
                        Text(it, color = MaterialTheme.colorScheme.error)
                    }
                    syncState.lastSyncedAt?.let {
                        Text("Last synced: $it", style = MaterialTheme.typography.bodySmall)
                    }
                    HorizontalDivider()
                    if (syncState.debugEntries.isEmpty()) {
                        Text("No sync details yet. Start a sync to see progress.")
                    } else {
                        Text("Latest 100 steps · Newest first · UTC", style = MaterialTheme.typography.labelSmall)
                        syncState.debugEntries.asReversed().forEach { entry ->
                            Column {
                                Text(
                                    entry.timestamp,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(entry.message, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}
