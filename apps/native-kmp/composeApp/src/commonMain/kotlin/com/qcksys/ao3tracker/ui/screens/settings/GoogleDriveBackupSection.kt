package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.backup.DriveBackupLocation
import com.qcksys.ao3tracker.data.backup.DriveBackupState
import kotlin.time.Instant

internal fun DriveBackupLocation.label(): String = when (this) {
    DriveBackupLocation.MY_DRIVE -> "File in My Drive"
    DriveBackupLocation.APP_DATA -> "Hidden app folder"
}

private fun DriveBackupLocation.description(): String = when (this) {
    DriveBackupLocation.MY_DRIVE -> "You can see, download or share the backup file in Google Drive."
    DriveBackupLocation.APP_DATA -> "Only AO3 Tracker can open it. Drive lets you delete it from Manage apps."
}

@Composable
internal fun GoogleDriveBackupSection(
    state: DriveBackupState,
    onSignIn: () -> Unit,
    onLocationChange: (DriveBackupLocation) -> Unit,
    onBackUpNow: () -> Unit,
    onRestore: () -> Unit,
    onSignOut: () -> Unit
) {
    val account = state.account
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.CloudUpload, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text("Google Drive backup", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 8.dp))
        }
        if (account == null) {
            Text(
                "Sign in with Google to back up this device's tracking to your Google Drive as JSON. " +
                    "Backups go one way; restore them manually on any device. They do not sync between devices.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            LocationChoice(state.location, enabled = !state.busy, onSelect = onLocationChange)
            OutlinedButton(
                onClick = onSignIn,
                enabled = !state.busy,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (state.busy) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text("Sign in with Google")
            }
        } else {
            Text("Backing up to $account", style = MaterialTheme.typography.bodyMedium)
            Text(
                when {
                    state.signInRequired -> "Backups are paused. Sign in with Google again to resume."
                    state.lastBackupAt != null ->
                        "Last backup: ${formatLastSyncTime(Instant.fromEpochMilliseconds(state.lastBackupAt).toString())}"
                    else -> "No backup from this device yet"
                },
                style = MaterialTheme.typography.bodySmall,
                color = if (state.signInRequired) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
            )
            LocationChoice(state.location, enabled = !state.busy, onSelect = onLocationChange)
            if (state.signInRequired) {
                Button(onClick = onBackUpNow, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                    Text("Sign in again")
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onBackUpNow, enabled = !state.busy, modifier = Modifier.weight(1f)) {
                    if (state.busy) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Text("Back up now")
                }
                OutlinedButton(onClick = onRestore, enabled = !state.busy, modifier = Modifier.weight(1f)) {
                    Text("Restore")
                }
            }
            TextButton(onClick = onSignOut, enabled = !state.busy) { Text("Sign out of Google") }
        }
        state.message?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun LocationChoice(selected: DriveBackupLocation, enabled: Boolean, onSelect: (DriveBackupLocation) -> Unit) {
    Column {
        Text("Save backups to", style = MaterialTheme.typography.labelMedium)
        DriveBackupLocation.entries.forEach { location ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(
                        selected = location == selected,
                        enabled = enabled,
                        role = Role.RadioButton,
                        onClick = { onSelect(location) }
                    )
            ) {
                RadioButton(selected = location == selected, onClick = null, enabled = enabled)
                Column(modifier = Modifier.padding(start = 8.dp, top = 4.dp, bottom = 4.dp)) {
                    Text(location.label(), style = MaterialTheme.typography.bodyMedium)
                    Text(
                        location.description(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
