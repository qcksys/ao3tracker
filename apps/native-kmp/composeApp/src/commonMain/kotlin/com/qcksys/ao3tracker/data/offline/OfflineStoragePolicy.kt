package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.data.database.OfflineChapterEntity
import com.qcksys.ao3tracker.data.database.OfflineSkinEntity

internal const val AUTOMATIC_OFFLINE_ALLOWANCE = 250L * 1024 * 1024
internal class OfflineAllowanceExceeded : IllegalStateException("Automatic downloads are paused because protected chapters fill the 250 MiB allowance.")
internal class OfflineStorageUnavailable : IllegalStateException("Unable to save the download. Free up device space and retry.")
internal fun offlineCaptureFailure(error: Exception): String = when (error) {
    is OfflineAllowanceExceeded -> "Automatic downloads are paused because protected chapters fill the 250 MiB allowance."
    is OfflineStorageUnavailable -> "Unable to save the download. Free up device space and retry."
    is OfflineThrottled -> "AO3 has paused downloads. Try again later."
    else -> "Unable to save this chapter. Reopen it and try again."
}
internal data class OfflineStorageUsage(val automaticBytes: Long = 0, val pinnedBytes: Long = 0)
internal data class OfflineChapterReference(val scope: OfflineFileScope, val key: String)
internal data class OfflineInventory(
    val scope: OfflineFileScope,
    val chapters: List<OfflineChapterEntity>,
    val skins: Map<String, OfflineSkinEntity>,
    val activeSkin: String?,
    val pinnedWorks: Set<Long>,
    val fileSizes: Map<String, Long>,
    val leasedFiles: Set<String>,
    val protectedChapters: Set<String>
) {
    fun usage(excluded: Set<OfflineChapterReference> = emptySet()): OfflineStorageUsage {
        fun resources(json: String) = offlineJson.decodeFromString<List<OfflineResource>>(json).map { it.hash }
        fun skinFiles(hash: String): Set<String> = skins[hash]?.let { resources(it.resourcesJson).toSet() + it.fileHash }.orEmpty()
        val automatic = mutableSetOf<String>()
        val pinned = mutableSetOf<String>()
        chapters.filter { OfflineChapterReference(scope, it.key) !in excluded }.forEach { chapter ->
            val destination = if (chapter.workId in pinnedWorks) pinned else automatic
            destination.add(chapter.fileHash)
            destination.addAll(resources(chapter.resourcesJson))
            destination.addAll(skinFiles(chapter.skinHash))
        }
        activeSkin?.let { hash -> (if (pinnedWorks.isNotEmpty()) pinned else automatic).addAll(skinFiles(hash)) }
        automatic.addAll(leasedFiles)
        automatic.removeAll(pinned)
        return OfflineStorageUsage(automatic.sumOf { fileSizes[it] ?: 0 }, pinned.sumOf { fileSizes[it] ?: 0 })
    }
}

internal fun offlineStorageUsage(inventories: List<OfflineInventory>, excluded: Set<OfflineChapterReference> = emptySet()): OfflineStorageUsage {
    val sizes = inventories.map { it.usage(excluded) }
    return OfflineStorageUsage(sizes.sumOf { it.automaticBytes }, sizes.sumOf { it.pinnedBytes })
}

internal fun automaticEvictions(inventories: List<OfflineInventory>, limit: Long): Set<OfflineChapterReference> {
    require(limit >= 0)
    if (offlineStorageUsage(inventories).automaticBytes <= limit) return emptySet()
    val candidates = inventories.flatMap { inventory ->
        inventory.chapters.filter { it.workId !in inventory.pinnedWorks && it.fileHash !in inventory.leasedFiles && it.key !in inventory.protectedChapters }
            .map { it.lastAccessedAt to OfflineChapterReference(inventory.scope, it.key) }
    }.sortedBy { it.first }.map { it.second }
    if (offlineStorageUsage(inventories, candidates.toSet()).automaticBytes > limit) throw OfflineAllowanceExceeded()
    var low = 1
    var high = candidates.size
    while (low < high) {
        val count = (low + high) / 2
        if (offlineStorageUsage(inventories, candidates.take(count).toSet()).automaticBytes <= limit) high = count else low = count + 1
    }
    return candidates.take(low).toSet()
}
