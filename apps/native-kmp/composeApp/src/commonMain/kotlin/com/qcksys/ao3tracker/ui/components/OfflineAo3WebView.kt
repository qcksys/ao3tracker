package com.qcksys.ao3tracker.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.qcksys.ao3tracker.data.offline.OfflineReaderDocument
import com.qcksys.ao3tracker.data.offline.OfflineReaderEvent

internal expect fun supportsOfflineReading(): Boolean

@Composable
internal expect fun OfflineAo3WebView(
    document: OfflineReaderDocument,
    modifier: Modifier = Modifier,
    onEvent: (OfflineReaderEvent) -> Unit,
    onFailure: () -> Unit,
    onBack: () -> Unit = {}
)
