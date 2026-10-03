package com.qcksys.ao3tracker.data.offline

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

internal actual fun offlineNetworkState(): StateFlow<OfflineNetwork> = MutableStateFlow(OfflineNetwork(false, false))
