package com.qcksys.ao3tracker.data.offline

import kotlin.time.Instant

internal data class OfflineDownloadNotification(val title: String, val text: String)

internal fun offlineWorkStatusText(download: OfflineWorkStatus?): String = when {
    download == null -> "Not saved on this device"
    download.job?.state == "running" -> "Downloading · continues in the background"
    download.job?.state == "queued" -> "Queued · waiting for a connection or retry"
    download.job?.state == "failed" -> download.job.error ?: "Download paused. Open the work in Read, then retry."
    else -> "${download.savedChapterIds.size} of ${download.publishedChapters} published chapters saved"
}

internal fun OfflineWorkStatus.savedChapterNumbers(): Set<Int> =
    chapters.filter { it.id in savedChapterIds }.map { it.number }.toSet()

private val queueOrder = listOf("running", "queued", "failed")

/** Works with unfinished jobs, in the order the queue will handle them. */
internal fun offlineDownloadQueue(downloads: List<OfflineWorkStatus>): List<OfflineWorkStatus> =
    downloads.filter { it.job?.state in queueOrder }.sortedBy { queueOrder.indexOf(it.job?.state) }

internal fun offlineDownloadsSummary(downloads: List<OfflineWorkStatus>): String {
    val states = downloads.mapNotNull { it.job?.state }
    val queued = states.count { it == "queued" }
    val failed = states.count { it == "failed" }
    val parts = listOfNotNull(
        "Downloading".takeIf { "running" in states },
        "$queued queued".takeIf { queued > 0 },
        "$failed paused".takeIf { failed > 0 }
    )
    if (parts.isNotEmpty()) return parts.joinToString(" · ")
    val saved = downloads.count { it.savedChapterIds.isNotEmpty() }
    return if (saved == 0) "None saved" else "$saved saved"
}

internal data class OfflineQueueProgress(val works: Int, val done: Int, val total: Int)

/**
 * Chapter counts (done to total) per work in this download session. Works that leave the queue
 * count as finished, so the overall progress does not move backwards when a work completes.
 */
internal fun offlineQueueChapters(downloads: List<OfflineWorkStatus>, previous: Map<Long, Pair<Int, Int>>): Map<Long, Pair<Int, Int>> {
    val current = downloads.mapNotNull { status ->
        val job = status.job?.takeIf { it.state == "running" || it.state == "queued" } ?: return@mapNotNull null
        val done = offlineJson.decodeFromString<List<String>>(job.completedJson).size
        status.work.workId to (done to done + offlineJson.decodeFromString<List<String>>(job.remainingJson).size)
    }.toMap()
    return previous.mapValues { (_, chapters) -> chapters.second to chapters.second } + current
}

internal fun offlineQueueProgress(downloads: List<OfflineWorkStatus>, chapters: Map<Long, Pair<Int, Int>>) = OfflineQueueProgress(
    works = downloads.count { it.job?.state == "running" || it.job?.state == "queued" },
    done = chapters.values.sumOf { it.first },
    total = chapters.values.sumOf { it.second }
)

internal fun offlineDownloadNotification(request: OfflineDownloadRequest?, status: OfflineWorkStatus?): OfflineDownloadNotification {
    if (request == null) return OfflineDownloadNotification("Saving chapters for offline reading", "Waiting for a connection or retry")
    val work = status?.work?.title ?: "Work ${request.workId}"
    val updating = request.mode.startsWith("update")
    val title = when {
        updating -> "Updating $work"
        request.automatic -> "Saving upcoming chapters of $work"
        else -> "Saving $work"
    }
    val text = when {
        request.mode.endsWith("-discover") -> "Finding chapters"
        updating -> "Updating chapter ${request.done + 1} of ${request.total}"
        else -> "Saving chapter ${request.done + 1} of ${request.total}"
    }
    return OfflineDownloadNotification(title, text)
}

/** Explicit downloads that AO3 or sync report as newer than their saved chapters. */
internal fun needsBackgroundUpdate(status: OfflineWorkStatus, latestRevision: String?): Boolean {
    if (!status.work.pinned || status.job != null && status.job.state != "complete") return false
    if (status.publishedChapters > status.chapters.size) return true
    val latest = latestRevision?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return false
    return status.snapshots.any { snapshot ->
        snapshot.downloadUpdatedAt?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { it < latest } == true
    }
}
