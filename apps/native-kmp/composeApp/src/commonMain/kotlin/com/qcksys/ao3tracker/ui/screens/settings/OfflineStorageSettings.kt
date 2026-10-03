package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.KeyboardType
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.settings.AppSettings
import org.koin.compose.koinInject

@Composable
internal fun OfflineStorageSettings(settings: AppSettings, onManageDownloads: () -> Unit) {
    val coordinator = koinInject<OfflineCoordinator>()
    if (!coordinator.enabled) return
    val usage by coordinator.storageUsage.collectAsState()
    OfflineStorageSettingsContent(settings, usage.automaticBytes, usage.pinnedBytes, onManageDownloads, coordinator::clearAutomatic)
}

@Composable
internal fun OfflineStorageSettingsContent(settings: AppSettings, automaticBytes: Long, pinnedBytes: Long,
    onManageDownloads: () -> Unit, onClearAutomatic: () -> Unit) {
    val preferences by settings.offlinePreferences.collectAsState()
    var count by rememberSaveable { mutableStateOf((preferences.prefetchChapters ?: 2).toString()) }
    SettingsSection(title = "Offline reading", icon = Icons.Default.Download,
        summary = if (preferences.automatic) "Automatic saving · ${preferences.prefetchChapters?.let { "Next $it chapters" } ?: "All upcoming chapters"}" else "Automatic saving off") {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Save chapters as I read", modifier = Modifier.weight(1f))
                Switch(preferences.automatic, { settings.setOfflinePreferences(preferences.copy(automatic = it)) },
                    modifier = Modifier.semantics { contentDescription = "Save chapters as I read" })
            }
            Text("Save the current chapter and prefetch upcoming chapters with your AO3 site skin. Automatic saves pause in incognito.")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Prefetch all upcoming chapters", modifier = Modifier.weight(1f))
                Switch(preferences.prefetchChapters == null, {
                    settings.setOfflinePreferences(preferences.copy(prefetchChapters = if (it) null else count.toIntOrNull()?.takeIf { value -> value >= 0 } ?: 2))
                }, modifier = Modifier.semantics { contentDescription = "Prefetch all upcoming chapters" })
            }
            if (preferences.prefetchChapters != null) {
                val valid = count.toIntOrNull()?.takeIf { it >= 0 }
                OutlinedTextField(value = count, onValueChange = { count = it }, singleLine = true,
                    label = { Text("Chapters to prefetch") }, isError = valid == null,
                    supportingText = { Text("Use 0 to save only the current chapter.") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                TextButton(onClick = { valid?.let { settings.setOfflinePreferences(preferences.copy(prefetchChapters = it)) } },
                    enabled = valid != null && valid != preferences.prefetchChapters) { Text("Save prefetch count") }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Prefetch only on Wi-Fi", modifier = Modifier.weight(1f))
                Switch(preferences.wifiOnly, { settings.setOfflinePreferences(preferences.copy(wifiOnly = it)) },
                    enabled = preferences.automatic,
                    modifier = Modifier.semantics { contentDescription = "Prefetch only on Wi-Fi" })
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Delete automatic saves after reading", modifier = Modifier.weight(1f))
                Switch(preferences.autoDeleteRead, { settings.setOfflinePreferences(preferences.copy(autoDeleteRead = it)) },
                    modifier = Modifier.semantics { contentDescription = "Delete automatic saves after reading" })
            }
            Text("Removes completed chapters saved automatically. Save whole work downloads stay until you remove them. Your reading progress is kept.")
            Text("Downloads continue when you switch apps or lock your phone. An ongoing notification shows progress.")
            Text("Automatic storage: ${offlineSize(automaticBytes)} of 250 MiB across all accounts")
            Text("Explicit downloads: ${offlineSize(pinnedBytes)} · kept until removed")
            Text("Older automatic saves are removed as space is needed. Save whole work keeps a work outside this allowance. Explicit downloads can use your current connection.")
            TextButton(onClick = onManageDownloads) { Text("Manage downloads") }
            TextButton(onClick = onClearAutomatic, enabled = automaticBytes > 0) {
                Text("Clear automatic saves across all accounts")
            }
        }
    }
}

private fun offlineSize(bytes: Long): String {
    val tenths = bytes * 10 / (1024 * 1024)
    return "${tenths / 10}.${tenths % 10} MiB"
}
