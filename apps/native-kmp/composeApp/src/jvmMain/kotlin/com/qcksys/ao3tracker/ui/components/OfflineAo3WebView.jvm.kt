package com.qcksys.ao3tracker.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.qcksys.ao3tracker.data.offline.OfflineReaderDocument
import com.qcksys.ao3tracker.data.offline.OfflineReaderEvent

internal actual fun supportsOfflineReading(): Boolean = false

@Composable
internal actual fun OfflineAo3WebView(document: OfflineReaderDocument, modifier: Modifier, onEvent: (OfflineReaderEvent) -> Unit, onFailure: () -> Unit, onBack: () -> Unit) {
    Text("Offline reading is available on Android.", modifier)
}
