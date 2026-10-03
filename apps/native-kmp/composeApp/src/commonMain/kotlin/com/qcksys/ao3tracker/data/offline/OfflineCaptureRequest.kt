package com.qcksys.ao3tracker.data.offline

class OfflineCaptureRequest internal constructor(
    internal val url: String,
    internal val expectedIdentity: String?,
    internal val isCurrent: () -> Boolean,
    internal val stageResource: suspend (OfflineResource, ByteArray) -> Unit,
    internal val publish: suspend (OfflineBundle) -> Unit,
    internal val onFailure: (message: String, retryAfter: String?) -> Unit
)
