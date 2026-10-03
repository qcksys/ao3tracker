package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.qcksys.ao3tracker.ui.components.OfflineWorkCard
import org.koin.compose.koinInject

internal class DownloadsScreen : Screen {
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    override fun Content() {
        val coordinator = koinInject<OfflineCoordinator>()
        val downloads by coordinator.downloads.collectAsState()
        val message by coordinator.message.collectAsState()
        val navigator = LocalNavigator.currentOrThrow
        Scaffold(topBar = { TopAppBar(title = { Text("Downloads") }, navigationIcon = {
            TextButton(onClick = { navigator.pop() }) { Text("Back") }
        }) }) { padding ->
            LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                message?.let { item { Text(it) } }
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
