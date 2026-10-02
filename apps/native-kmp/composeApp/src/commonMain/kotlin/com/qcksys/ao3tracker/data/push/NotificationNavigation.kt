package com.qcksys.ao3tracker.data.push

internal fun notificationWorkId(remoteWorkId: String?, localWorkId: Long): Long? =
    (remoteWorkId?.toLongOrNull() ?: localWorkId).takeIf { it > 0 }
