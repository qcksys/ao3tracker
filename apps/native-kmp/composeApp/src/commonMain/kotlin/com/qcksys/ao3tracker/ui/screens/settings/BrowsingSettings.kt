package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.settings.AppSettings

@Composable
fun BrowsingSettings(appSettings: AppSettings) {
    val preferences by appSettings.browsingPreferences.collectAsState()
    var draft by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun save(action: () -> Unit) {
        error = null
        try {
            action()
        } catch (_: Exception) {
            error = "Could not save search preferences. Please try again."
        }
    }

    SettingsSection(
        title = "Search preferences",
        summary = "${preferences.hiddenTags.size} hidden tags · ${preferences.hiddenWorkIds.size} hidden works",
        icon = Icons.Default.VisibilityOff
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Applies to AO3 searches on this device. Other devices keep their own preferences.")
            OutlinedTextField(
                value = draft ?: preferences.hiddenTags.joinToString("\n"),
                onValueChange = { draft = it },
                label = { Text("Default hidden tags") },
                supportingText = { Text("One tag per line, or separated by commas. Added to every work and bookmark search.") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
            Button(enabled = draft != null, onClick = {
                save {
                    appSettings.setHiddenTags(draft.orEmpty())
                    draft = null
                }
            }) { Text("Save hidden tags") }
            Text("Hidden works (${preferences.hiddenWorkIds.size})", style = MaterialTheme.typography.titleSmall)
            if (preferences.hiddenWorkIds.isEmpty()) {
                Text("Use “Hide work” on an AO3 result to hide it from lists.")
            }
            preferences.hiddenWorkIds.forEach { workId ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Work $workId", modifier = Modifier.weight(1f))
                    TextButton(onClick = { save { appSettings.setWorkHidden(workId, false) } }) {
                        Text("Unhide")
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}
