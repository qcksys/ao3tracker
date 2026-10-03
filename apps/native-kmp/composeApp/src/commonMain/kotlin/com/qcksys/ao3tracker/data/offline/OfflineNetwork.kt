package com.qcksys.ao3tracker.data.offline

import kotlinx.coroutines.flow.StateFlow

internal data class OfflineNetwork(val connected: Boolean, val wifi: Boolean)
internal expect fun offlineNetworkState(): StateFlow<OfflineNetwork>
