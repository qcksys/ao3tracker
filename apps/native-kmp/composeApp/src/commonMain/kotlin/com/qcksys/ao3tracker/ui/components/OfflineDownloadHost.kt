package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
    PlatformOfflineDownloadHost(coordinator)
}

@Composable
internal expect fun PlatformOfflineDownloadHost(coordinator: OfflineCoordinator)
