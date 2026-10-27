package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.offline.OfflineDownloadRequest
import com.qcksys.ao3tracker.data.offline.OfflineWorkStatus
import com.qcksys.ao3tracker.data.offline.offlineDownloadNotification
import com.qcksys.ao3tracker.data.offline.offlineDownloadQueue
import com.qcksys.ao3tracker.data.offline.offlineWorkStatusText
import com.qcksys.ao3tracker.ui.components.OfflineWorkCard
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import org.koin.compose.koinInject

internal class DownloadsScreen : Screen {
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    override fun Content() {
        val coordinator = koinInject<OfflineCoordinator>()
        val downloads by coordinator.downloads.collectAsState()
        val background by coordinator.background.collectAsState()
        val message by coordinator.message.collectAsState()
        val navigator = LocalNavigator.currentOrThrow
        Scaffold(topBar = { TopAppBar(title = { Text("Downloads") }, navigationIcon = {
            TextButton(onClick = { navigator.pop() }) { Text("Back") }
        }) }) { padding ->
            LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                message?.let { item { Text(it) } }
                item {
                    DownloadQueueSection(offlineDownloadQueue(downloads), background,
                        onOpenLive = { workId -> coordinator.retry(workId); NavigationState.navigateToLiveWork(workId) },
                        onRetry = coordinator::retry)
                }
                item { Text("Saved works", style = MaterialTheme.typography.titleMedium) }
                if (downloads.isEmpty()) item { Text("No works saved for this AO3 account. Open a work in Read and choose Save whole work.") }
                items(downloads, key = { it.work.workId }) { download ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(download.work.title, style = MaterialTheme.typography.titleMedium)
                        OfflineWorkCard(download.work.workId)
                    }
                }
            }
        }
    }
}

@Composable
internal fun DownloadQueueSection(
    queue: List<OfflineWorkStatus>,
    active: OfflineDownloadRequest?,
    onOpenLive: (workId: Long) -> Unit,
    onRetry: (workId: Long) -> Unit
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Download queue", style = MaterialTheme.typography.titleMedium)
            if (queue.isEmpty()) Text("No downloads in progress.")
            for (download in queue) {
                val workId = download.work.workId
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(download.work.title, style = MaterialTheme.typography.bodyLarge)
                    val status = active?.takeIf { it.workId == workId }?.let { offlineDownloadNotification(it, download).text }
                        ?: offlineWorkStatusText(download)
                    Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    when (download.job?.state) {
                        "queued" -> TextButton(onClick = { onOpenLive(workId) }) { Text("Open on AO3") }
                        "failed" -> TextButton(onClick = { onRetry(workId) }) { Text("Retry download") }
                    }
                }
            }
        }
    }
}
