package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.settings.AppSettings
import org.koin.compose.koinInject

@Composable
internal fun OfflineStorageSettings(settings: AppSettings, onManageDownloads: () -> Unit) {
    val coordinator = koinInject<OfflineCoordinator>()
    if (!coordinator.enabled) return
    val preferences by settings.offlinePreferences.collectAsState()
    val usage by coordinator.storageUsage.collectAsState()
    HorizontalDivider()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Offline reading", style = MaterialTheme.typography.titleSmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Save chapters as I read", modifier = Modifier.weight(1f))
            Switch(preferences.automatic, { settings.setOfflinePreferences(preferences.copy(automatic = it)) },
                modifier = Modifier.semantics { contentDescription = "Save chapters as I read" })
        }
        Text("Off by default. When enabled, saves the current chapter and prepares the next two with your AO3 site skin. Automatic saves pause in incognito.")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Prefetch only on Wi-Fi", modifier = Modifier.weight(1f))
            Switch(preferences.wifiOnly, { settings.setOfflinePreferences(preferences.copy(wifiOnly = it)) },
                enabled = preferences.automatic,
                modifier = Modifier.semantics { contentDescription = "Prefetch only on Wi-Fi" })
        }
        Text("Automatic storage: ${offlineSize(usage.automaticBytes)} of 250 MiB across all accounts")
        Text("Explicit downloads: ${offlineSize(usage.pinnedBytes)} · kept until removed")
        Text("Older automatic saves are removed as space is needed. Save whole work keeps a work outside this allowance. Explicit downloads can use your current connection.")
        TextButton(onClick = onManageDownloads) { Text("Manage downloads") }
        TextButton(onClick = { coordinator.clearAutomatic() }, enabled = usage.automaticBytes > 0) {
            Text("Clear automatic saves across all accounts")
        }
    }
}

private fun offlineSize(bytes: Long): String {
    val tenths = bytes * 10 / (1024 * 1024)
    return "${tenths / 10}.${tenths % 10} MiB"
}
