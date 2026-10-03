package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.offline.OfflineDownloadService

@Composable
internal actual fun PlatformOfflineDownloadHost(coordinator: OfflineCoordinator) {
    val context = LocalContext.current.applicationContext
    val foreground by coordinator.isForeground.collectAsState()
    val pending by coordinator.hasPendingDownloads.collectAsState()
    val network by coordinator.network.collectAsState()
    LaunchedEffect(foreground, pending, network.connected, coordinator) {
        if (foreground && pending && network.connected) OfflineDownloadService.start(context, coordinator)
    }
}
