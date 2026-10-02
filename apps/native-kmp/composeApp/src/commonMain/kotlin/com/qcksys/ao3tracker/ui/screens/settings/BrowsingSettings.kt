package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Switch
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.Ao3Languages

@Composable
fun BrowsingSettings(appSettings: AppSettings) {
    val preferences by appSettings.browsingPreferences.collectAsState()
    var draft by remember { mutableStateOf<String?>(null) }
    var fandomDraft by remember { mutableStateOf<String?>(null) }
    val fandomInput = fandomDraft ?: preferences.maxFandoms?.toString().orEmpty()
    val fandomLimit = fandomInput.trim().toIntOrNull()
    val validFandomLimit = fandomInput.isBlank() || (fandomLimit != null && fandomLimit > 0)
    var error by remember { mutableStateOf<String?>(null) }
    var languagesExpanded by remember { mutableStateOf(false) }
    val languageLabel = Ao3Languages.options.firstOrNull { it.first == preferences.searchLanguage }?.second ?: preferences.searchLanguage

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
        summary = "${if (preferences.languageFilterEnabled) languageLabel else "All languages"} · ${preferences.maxFandoms?.let { "Max $it fandoms" } ?: "No fandom limit"} · ${preferences.hiddenTags.size} hidden tags · ${preferences.hiddenWorkIds.size} hidden works",
        icon = Icons.Default.VisibilityOff
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Applies to AO3 searches on this device. Other devices keep their own preferences.")
            Text("Search language", style = MaterialTheme.typography.titleSmall)
            Box {
                TextButton(onClick = { languagesExpanded = true }) { Text(languageLabel) }
                DropdownMenu(expanded = languagesExpanded, onDismissRequest = { languagesExpanded = false }) {
                    Ao3Languages.options.forEach { (code, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = {
                            save { appSettings.setSearchLanguage(code, preferences.languageFilterEnabled) }
                            languagesExpanded = false
                        })
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Filter searches by language", modifier = Modifier.weight(1f))
                Switch(
                    checked = preferences.languageFilterEnabled,
                    onCheckedChange = { enabled -> save { appSettings.setSearchLanguage(preferences.searchLanguage, enabled) } },
                    modifier = Modifier.semantics { contentDescription = "Filter searches by language" }
                )
            }
            Text("When enabled, every AO3 work and bookmark search uses this language, replacing any language already selected.")
            OutlinedTextField(
                value = fandomInput,
                onValueChange = { fandomDraft = it },
                label = { Text("Maximum fandoms per work") },
                placeholder = { Text("No limit") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                isError = !validFandomLimit,
                supportingText = { Text(if (validFandomLimit) "Leave blank for no limit. Hide works with more fandoms than this in work and bookmark lists. Set to 1 to also apply Exclude crossovers to work searches. AO3’s result counts stay unchanged when works are hidden locally." else "Enter a positive whole number or leave blank.") },
                modifier = Modifier.fillMaxWidth()
            )
            Button(enabled = fandomDraft != null && validFandomLimit, onClick = {
                save {
                    appSettings.setMaxFandoms(fandomLimit)
                    fandomDraft = null
                }
            }) { Text("Save fandom limit") }
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
