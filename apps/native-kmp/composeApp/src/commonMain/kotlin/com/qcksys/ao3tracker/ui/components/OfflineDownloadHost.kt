package com.qcksys.ao3tracker.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import org.koin.compose.koinInject

@Composable
internal fun OfflineDownloadHost() {
    val coordinator = koinInject<OfflineCoordinator>()
    if (!coordinator.enabled) return
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, coordinator) {
        val observer = LifecycleEventObserver { _, _ ->
            coordinator.setForeground(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
        }
        lifecycle.addObserver(observer)
        coordinator.setForeground(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
        onDispose { lifecycle.removeObserver(observer); coordinator.setForeground(false) }
    }
    val request by coordinator.background.collectAsState()
    request?.let { download ->
        key(download.id) {
            Ao3WebView(download.url, Modifier.size(1.dp).alpha(0f).clearAndSetSemantics {},
                pageScript = "", offlineCapture = download.capture,
                onUrlChange = { coordinator.downloadNavigation(download.id, it) },
                onLoadFailure = { status, retry -> coordinator.downloadFailure(download.id, status, retry) })
        }
    }
}
