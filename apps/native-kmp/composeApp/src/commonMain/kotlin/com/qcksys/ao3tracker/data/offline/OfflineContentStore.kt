package com.qcksys.ao3tracker.data.offline

import androidx.room.immediateTransaction
import androidx.room.useWriterConnection
import com.qcksys.ao3tracker.data.database.Ao3Database
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.OfflineChapterEntity
import com.qcksys.ao3tracker.data.database.OfflineContextEntity
import com.qcksys.ao3tracker.data.database.OfflineDao
import com.qcksys.ao3tracker.data.database.OfflineResourceEntity
import com.qcksys.ao3tracker.data.database.OfflineSkinEntity
import com.qcksys.ao3tracker.data.database.OfflineWorkEntity
import com.qcksys.ao3tracker.data.database.OfflineJobEntity
import com.qcksys.ao3tracker.data.settings.OfflinePreferences
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlin.time.Clock
import kotlin.time.Instant
import kotlin.uuid.Uuid

internal data class OfflineContext(val owner: String, val generation: Long, val id: String, val identity: String, val epoch: Long, val reset: Long) {
    val files: OfflineFileScope get() = OfflineFileScope(offlineSha256(owner.encodeToByteArray()), id)
}

@Serializable
internal data class StoredOfflineChapter(val page: OfflinePage, val missingResources: List<String>)

@Serializable
internal data class StoredOfflineSkin(val styles: List<OfflineStyle>, val missingResources: List<String>)

internal data class OpenOfflineChapter(val document: OfflineReaderDocument, val savedAt: Long, val missingResources: List<String>)

internal data class OfflineWorkStatus(
    val work: OfflineWorkEntity,
    val chapters: List<OfflineChapter>,
    val savedChapterIds: Set<String>,
    val job: OfflineJobEntity?,
    val bytes: Long,
    val publishedChapters: Int = chapters.size,
    val snapshots: List<OfflineChapterEntity> = emptyList()
)

internal class OfflineContentStore(
    private val accounts: AccountDataStore,
    private val files: OfflineFiles,
    private val now: () -> Long = { Clock.System.now().toEpochMilliseconds() },
    internal val automaticAllowance: Long = AUTOMATIC_OFFLINE_ALLOWANCE
) {
    private val mutex = Mutex()
    private val selected = MutableStateFlow<OfflineContext?>(null)
    val context = selected.asStateFlow()
    private var epoch = 0L
    private data class Lease(val scope: OfflineFileScope, val keys: Set<String>)
    private val leases = MutableStateFlow<Map<String, Lease>>(emptyMap())
    private val protectedPage = MutableStateFlow<OfflineChapterReference?>(null)

    fun releaseReaderProtection() { protectedPage.value = null }

    fun isCurrent(context: OfflineContext): Boolean = selected.value == context &&
        accounts.generation == context.generation && accounts.offlineReset.value == context.reset && accounts.active.value?.owner == context.owner

    suspend fun initialize(): OfflineContext? = mutex.withLock {
        accounts.initialize()
        accounts.read { database ->
            val owner = requireNotNull(accounts.active.value).owner
            val saved = database.offlineDao().selectedContext()
            val previous = selected.value
            selected.value = saved?.let {
                if (previous != null && isCurrent(previous) && previous.id == it.id) previous
                else OfflineContext(owner, accounts.generation, it.id, it.identity, ++epoch, accounts.offlineReset.value)
            }
        }
        selected.value
    }

    suspend fun observeIdentity(identity: String, isAllowed: () -> Boolean = { true }): OfflineContext = mutex.withLock {
        require(identity == "guest" || identity.startsWith("user:") && identity.length in 6..196)
        accounts.initialize()
        val owner = requireNotNull(accounts.active.value).owner
        val generation = accounts.generation
        accounts.forAccount(owner, { accounts.generation == generation && isAllowed() }) {
            val dao = accounts.database.offlineDao()
            val saved = dao.contextForIdentity(identity) ?: OfflineContextEntity(Uuid.random().toString(), identity, false, null)
            dao.deselectContexts()
            dao.saveContext(saved.copy(selected = true))
            val previous = selected.value
            if (previous == null || !isCurrent(previous) || previous.id != saved.id) {
                selected.value = OfflineContext(owner, generation, saved.id, identity, ++epoch, accounts.offlineReset.value)
            }
        }
        requireNotNull(selected.value)
    }

    suspend fun beginCapture(context: OfflineContext, isAllowed: () -> Boolean = { true }): Capture = mutex.withLock {
        checkCurrent(context, isAllowed)
        val id = Uuid.random().toString()
        leases.update { it + (id to Lease(context.files, emptySet())) }
        Capture(id, context, isAllowed)
    }

    inner class Capture internal constructor(private val id: String, private val context: OfflineContext, private val isAllowed: () -> Boolean) {
        private val resources = mutableMapOf<String, OfflineResource>()
        private var finished = false

        suspend fun stage(resource: OfflineResource, bytes: ByteArray) = withContext(Dispatchers.IO) {
            mutex.withLock {
                checkCurrent(context, isAllowed)
                check(!finished)
                require(resource.bytes == bytes.size.toLong() && bytes.size <= OFFLINE_RESOURCE_LIMIT)
                require(offlineAssetMime(resource.mimeType) && offlineResourceHash(resource.mimeType, bytes) == resource.hash)
                require(resources.size < 1000 && resources.values.sumOf { it.bytes } + resource.bytes <= OFFLINE_BUNDLE_LIMIT)
                accounts.read {
                    checkCurrent(context, isAllowed)
                    files.put(context.files, resource.hash, bytes)
                }
                resources[resource.hash] = resource
                leases.update { it + (id to Lease(context.files, resources.keys.toSet())) }
            }
        }

        suspend fun publish(bundle: OfflineBundle, foreground: Boolean, pin: Boolean = false, jobId: String? = null, automatic: Boolean = false, deleteRead: Boolean = false) = withContext(Dispatchers.IO) {
            mutex.withLock {
                checkCurrent(context, isAllowed)
                check(!finished)
                require(bundle.page.ao3Identity == context.identity && bundle.page.version == 1)
                val saveChapter = bundle.page.representation == "chapter"
                require(saveChapter || bundle.page.representation == "whole" && foreground && jobId == null)
                require(bundle.resources.size == resources.size && bundle.resources.all { resources[it.hash] == it })
                require(bundle.skinHash == offlineSkinHash(bundle.page.siteStyles))
                val available = bundle.resources.associateBy { it.hash }
                require(available.values.all { validResource(context.files, it) })
                val siteResources = resourceClosure(context.files, bundle.page.siteStyles.map { it.css }, available)
                val chapterResources = if (saveChapter) resourceClosure(context.files, listOf(bundle.page.html), available) else emptyList()
                val skinBytes = offlineJson.encodeToString(StoredOfflineSkin(bundle.page.siteStyles, bundle.missingResources)).encodeToByteArray()
                val chapterBytes = if (saveChapter) offlineJson.encodeToString(StoredOfflineChapter(bundle.page.copy(siteStyles = emptyList()), bundle.missingResources)).encodeToByteArray() else null
                require(skinBytes.size <= OFFLINE_BUNDLE_LIMIT && (chapterBytes?.size ?: 0) <= OFFLINE_BUNDLE_LIMIT)
                val skinFile = offlineSha256(skinBytes)
                val chapterFile = chapterBytes?.let(::offlineSha256)
                accounts.read {
                    checkCurrent(context, isAllowed)
                    files.put(context.files, skinFile, skinBytes)
                    if (chapterFile != null) files.put(context.files, chapterFile, chapterBytes)
                }
                val time = now()
                val skinRecord = OfflineSkinEntity(context.id, bundle.skinHash, skinFile, offlineJson.encodeToString(siteResources), time, skinBytes.size.toLong())
                val chapterRecord = if (chapterFile != null) OfflineChapterEntity(context.id, chapterKey(bundle.page.url, bundle.page.chapterId), bundle.page.workId.toLong(),
                    bundle.page.chapterId.toLong(), bundle.page.representation, bundle.page.url, chapterFile, bundle.skinHash,
                    offlineJson.encodeToString(chapterResources), time, time, chapterBytes.size.toLong(), bundle.page.downloadUpdatedAt) else null
                if (automatic) ensureAutomaticSpace(context, chapterRecord, skinRecord, bundle.resources, foreground && bundle.page.canSelectSkin, isAllowed)
                forContext(context, isAllowed) { dao ->
                    val job = jobId?.let { requireNotNull(dao.job(it)) }
                    if (job != null) check(job.contextId == context.id && job.workId == bundle.page.workId.toLong() && job.state == "running")
                    val oldWork = dao.work(context.id, bundle.page.workId.toLong())
                    dao.saveResources(bundle.resources.map { OfflineResourceEntity(context.id, it.hash, it.mimeType, it.bytes) })
                    dao.saveSkin(skinRecord)
                    if (chapterRecord != null) {
                        if (deleteRead && !pin && oldWork?.pinned != true && chapterIsRead(bundle.page.workId.toLong(), bundle.page.chapterId,
                                bundle.page.chapters.firstOrNull { it.id == bundle.page.chapterId }?.number)) {
                            dao.deleteChapter(context.id, chapterRecord.key)
                        } else dao.saveChapter(chapterRecord)
                        dao.saveWork(OfflineWorkEntity(context.id, bundle.page.workId.toLong(), bundle.page.title,
                            if (job?.mode in setOf("save", "update") && oldWork != null) oldWork.chaptersJson else offlineJson.encodeToString(bundle.page.chapters),
                            pin || oldWork?.pinned == true, time))
                    }
                    if (foreground && bundle.page.canSelectSkin) {
                        val active = requireNotNull(dao.selectedContext())
                        dao.saveContext(active.copy(activeSkin = bundle.skinHash))
                    }
                    if (job != null) {
                        val completed = offlineJson.decodeFromString<List<String>>(job.completedJson) + bundle.page.url
                        val remaining = if (job.mode.endsWith("-discover")) {
                            val existing = dao.chapters(context.id).map { it.key }.toSet()
                            bundle.page.chapters.filter { chapter ->
                                chapter.id != bundle.page.chapterId &&
                                    (job.mode == "update-discover" || chapterKey(chapter.url, chapter.id) !in existing)
                            }.map { it.url }
                        } else offlineJson.decodeFromString<List<String>>(job.remainingJson).drop(1)
                        dao.saveJob(job.copy(mode = job.mode.removeSuffix("-discover"), remainingJson = offlineJson.encodeToString(remaining),
                            completedJson = offlineJson.encodeToString(completed), state = if (remaining.isEmpty()) "complete" else "queued",
                            error = null, attempts = 0, retryAt = 0))
                    }
                }
                finished = true
                if (foreground && chapterRecord != null) protectedPage.value = OfflineChapterReference(context.files, chapterRecord.key)
                leases.update { it - id }
            }
        }

        suspend fun cancel() = mutex.withLock {
            finished = true
            leases.update { it - id }
        }
    }

    suspend fun open(context: OfflineContext, url: String, scroll: Float = 0f, fragment: String = ""): OpenOfflineChapter? = withContext(Dispatchers.IO) {
        mutex.withLock {
            checkCurrent(context)
            forContext(context) { dao ->
                val location = offlineLocation(url)
                if (location.representation == "whole") return@forContext null
                val chapterId = location.chapterId ?: dao.work(context.id, location.workId.toLong())?.let {
                    offlineJson.decodeFromString<List<OfflineChapter>>(it.chaptersJson).firstOrNull()?.id
                } ?: return@forContext null
                val entry = dao.chapter(context.id, chapterKey(url, chapterId)) ?: return@forContext null
                val chapter = readObject<StoredOfflineChapter>(context.files, entry.fileHash)
                val contentResources = decodeResources(entry.resourcesJson)
                if (chapter == null || contentResources.any { !validResource(context.files, it) }) {
                    dao.deleteChapter(context.id, entry.key)
                    return@forContext null
                }
                val active = dao.selectedContext()?.activeSkin
                val skin = listOfNotNull(active, entry.skinHash).distinct().firstNotNullOfOrNull { hash ->
                    val record = dao.skin(context.id, hash) ?: return@firstNotNullOfOrNull null
                    val data = readObject<StoredOfflineSkin>(context.files, record.fileHash) ?: return@firstNotNullOfOrNull null
                    val resources = decodeResources(record.resourcesJson)
                    if (offlineSkinHash(data.styles) != hash || resources.any { !validResource(context.files, it) }) null else Triple(record, data, resources)
                } ?: return@forContext null
                val resources = (contentResources + skin.third).distinctBy { it.hash }
                val lease = Uuid.random().toString()
                leases.update { it + (lease to Lease(context.files, resources.map { it.hash }.toSet() + entry.fileHash + skin.first.fileHash)) }
                val document = OfflineReaderDocument(chapter.page, resources, skin.second.styles, scroll, fragment,
                    isCurrent = { isCurrent(context) }, readResource = { files.read(context.files, it, OFFLINE_RESOURCE_LIMIT) },
                    onClose = { leases.update { it - lease } })
                dao.saveChapter(entry.copy(lastAccessedAt = now()))
                protectedPage.value = OfflineChapterReference(context.files, entry.key)
                OpenOfflineChapter(document, entry.savedAt, (chapter.missingResources + skin.second.missingResources).distinct())
            }
        }
    }

    suspend fun removeWork(context: OfflineContext, workId: Long) = withContext(Dispatchers.IO) {
        mutex.withLock {
            forContext(context) { dao ->
                dao.deleteWorkJobs(context.id, workId)
                dao.deleteWorkChapters(context.id, workId)
                dao.deleteWork(context.id, workId)
            }
        }
        collectUnusedFiles()
    }

    suspend fun statuses(context: OfflineContext): List<OfflineWorkStatus> = mutex.withLock {
        forContext(context) { dao ->
            val snapshots = dao.chapters(context.id)
            val jobs = dao.jobs(context.id)
            dao.works(context.id).map { work ->
                val chapters = offlineJson.decodeFromString<List<OfflineChapter>>(work.chaptersJson)
                val saved = snapshots.filter { it.workId == work.workId }
                val ids = saved.filter { it.representation == "chapter" }.map { it.chapterId.toString() }.toSet()
                val resources = saved.flatMap { decodeResources(it.resourcesJson) }.distinctBy { it.hash }
                val skins = (saved.map { it.skinHash } + listOfNotNull(dao.selectedContext()?.activeSkin)).distinct().mapNotNull { dao.skin(context.id, it) }
                val assets = (resources + skins.flatMap { decodeResources(it.resourcesJson) }).distinctBy { it.hash }
                val workJobs = jobs.filter { it.workId == work.workId }
                val visibleJob = workJobs.firstOrNull { it.mode != "prefetch" && it.state != "complete" }
                    ?: workJobs.lastOrNull { it.state != "complete" } ?: workJobs.lastOrNull()
                OfflineWorkStatus(work, chapters, ids, visibleJob,
                    saved.sumOf { it.bytes } + skins.distinctBy { it.fileHash }.sumOf { it.bytes } + assets.sumOf { it.bytes },
                    maxOf(chapters.size, accounts.database.workDao().getWorkById(work.workId)?.currentChapters ?: 0), saved)
            }
        }
    }

    suspend fun enqueueWork(context: OfflineContext, workId: Long, update: Boolean = false) = mutex.withLock {
        require(workId > 0)
        forContext(context) { dao ->
            val old = dao.work(context.id, workId)
            dao.saveWork(old?.copy(pinned = true) ?: OfflineWorkEntity(context.id, workId, "Work $workId", "[]", true, now()))
            dao.deleteWorkJobs(context.id, workId)
            dao.saveJob(OfflineJobEntity(Uuid.random().toString(), context.id, workId, if (update) "update-discover" else "save-discover",
                offlineJson.encodeToString(listOf("https://archiveofourown.org/works/$workId?view_full_work=false")), "[]", "queued", 0, 0, null, now()))
        }
    }

    suspend fun enqueuePrefetch(context: OfflineContext, page: OfflinePage, refreshCurrent: Boolean = false,
        preferences: OfflinePreferences = OfflinePreferences(), isAllowed: () -> Boolean = { true }) = mutex.withLock {
        forContext(context, isAllowed) { dao ->
            dao.deletePrefetchJobs(context.id)
            val currentIndex = page.chapters.indexOfFirst { it.id == page.chapterId }
            if (currentIndex < 0 || page.representation == "whole") return@forContext
            val deleteRead = preferences.autoDeleteRead && dao.work(context.id, page.workId.toLong())?.pinned != true
            val chapters = page.chapters.drop(currentIndex + 1).take(preferences.prefetchChapters ?: Int.MAX_VALUE)
                .filterNot { deleteRead && chapterIsRead(page.workId.toLong(), it.id, it.number) }
            val latest = listOfNotNull(page.downloadUpdatedAt,
                accounts.database.workDao().getWorkById(page.workId.toLong())?.downloadUpdatedAt)
                .mapNotNull { runCatching { Instant.parse(it) }.getOrNull() }.maxOrNull()
            fun outdated(entry: OfflineChapterEntity): Boolean = latest != null &&
                (entry.downloadUpdatedAt?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { it < latest } != false)
            val saved = chapters.filter { chapter ->
                dao.chapter(context.id, chapterKey(chapter.url, chapter.id))?.let { !outdated(it) } == true
            }
            val current = dao.chapter(context.id, chapterKey(page.url, page.chapterId))
            val refresh = if (refreshCurrent && current != null &&
                (!deleteRead || !chapterIsRead(current.workId, page.chapterId, page.chapters[currentIndex].number)) &&
                (outdated(current) || now() - current.savedAt >= 30 * 60 * 1000L)) listOf(page.url) else emptyList()
            val stale = dao.chapters(context.id).filter { it.workId == page.workId.toLong() && outdated(it) }
                .filterNot { deleteRead && chapterIsRead(it.workId, it.chapterId.toString(),
                    page.chapters.firstOrNull { chapter -> chapter.id == it.chapterId.toString() }?.number) }.map { it.url }
            val remaining = (refresh + chapters.filterNot { it in saved }.map { it.url } + stale).distinct()
            if (chapters.isNotEmpty() || remaining.isNotEmpty()) dao.saveJob(OfflineJobEntity(Uuid.random().toString(), context.id, page.workId.toLong(), "prefetch",
                offlineJson.encodeToString(remaining), offlineJson.encodeToString(saved.map { it.url }),
                if (remaining.isEmpty()) "complete" else "queued", 0, 0, null, now()))
        }
    }

    private suspend fun chapterIsRead(workId: Long, chapterId: String, number: Int?): Boolean {
        val dao = accounts.database.chapterDao()
        val chapter = dao.getChapterById(chapterId.toLong(), workId)
            ?: number?.let { dao.getChapterByWorkAndNumber(workId, it) }
        return chapter != null && (chapter.markedCompleteAt != null || (chapter.readProgress ?: 0f) >= 0.95f)
    }

    suspend fun removeReadChapters(context: OfflineContext, isAllowed: () -> Boolean = { true }) {
        mutex.withLock {
            forContext(context, isAllowed) { dao ->
                val automatic = dao.works(context.id).filterNot { it.pinned }
                val manifests = automatic.associate { it.workId to offlineJson.decodeFromString<List<OfflineChapter>>(it.chaptersJson) }
                for (chapter in dao.chapters(context.id).filter { it.workId in manifests }) {
                    val number = manifests[chapter.workId]?.firstOrNull { it.id == chapter.chapterId.toString() }?.number
                    if (chapterIsRead(chapter.workId, chapter.chapterId.toString(), number)) dao.deleteChapter(context.id, chapter.key)
                }
                for (job in dao.jobs(context.id).filter { it.workId in manifests && it.mode == "prefetch" && it.state == "queued" }) {
                    val remaining = offlineJson.decodeFromString<List<String>>(job.remainingJson)
                    val kept = remaining.filterNot { url ->
                        val location = offlineLocation(url)
                        val chapter = manifests[job.workId]?.firstOrNull { it.id == location.chapterId }
                        location.chapterId != null && chapterIsRead(job.workId, location.chapterId, chapter?.number)
                    }
                    if (kept != remaining) dao.saveJob(job.copy(remainingJson = offlineJson.encodeToString(kept),
                        state = if (kept.isEmpty()) "complete" else job.state))
                }
            }
        }
        collectUnusedFiles()
    }

    suspend fun nextJob(context: OfflineContext, allowAutomatic: Boolean = true): OfflineJobEntity? = mutex.withLock {
        forContext(context) { dao -> dao.jobs(context.id).filter { it.mode != "prefetch" || allowAutomatic }
            .sortedBy { if (it.mode == "prefetch") 1 else 0 }
            .firstOrNull { it.state in setOf("queued", "running") && it.retryAt <= now() } }
    }

    suspend fun nextRetryAt(context: OfflineContext, allowAutomatic: Boolean): Long? = mutex.withLock {
        forContext(context) { dao -> dao.jobs(context.id).filter { it.state == "queued" && (it.mode != "prefetch" || allowAutomatic) && it.retryAt > now() }.minOfOrNull { it.retryAt } }
    }

    suspend fun failJob(context: OfflineContext, id: String, message: String, cooldown: Long): Long? = mutex.withLock {
        forContext(context) { dao ->
            val job = dao.job(id)?.takeIf { it.contextId == context.id && it.state != "complete" } ?: return@forContext null
            val attempts = job.attempts + 1
            val retryAt = if (attempts < 3) maxOf(cooldown, now() + listOf(5000L, 30_000L)[attempts - 1]) else 0
            dao.saveJob(job.copy(state = if (retryAt > 0) "queued" else "failed", error = message, retryAt = retryAt, attempts = attempts))
            retryAt.takeIf { it > 0 }
        }
    }

    suspend fun setJobState(context: OfflineContext, id: String, state: String, error: String? = null, retryAt: Long = 0) = mutex.withLock {
        forContext(context) { dao ->
            val job = dao.job(id) ?: return@forContext
            if (job.contextId != context.id || job.state == "complete") return@forContext
            dao.saveJob(job.copy(state = state, error = error, retryAt = retryAt, attempts = job.attempts + if (state == "failed") 1 else 0))
        }
    }

    suspend fun retryWork(context: OfflineContext, workId: Long) = mutex.withLock {
        forContext(context) { dao ->
            dao.jobs(context.id).filter { it.workId == workId && it.state != "complete" }.forEach {
                dao.saveJob(it.copy(state = "queued", error = null, retryAt = 0, attempts = 0))
            }
        }
    }

    suspend fun collectUnusedFiles() = withContext(Dispatchers.IO) {
        mutex.withLock {
            accounts.offlineDatabases { databases ->
                for ((accountOwner, database) in databases) {
                val dao = database.offlineDao()
                val owner = offlineSha256(accountOwner.encodeToByteArray())
                val contexts = dao.contexts()
                for (context in contexts) {
                    val scope = OfflineFileScope(owner, context.id)
                    val chapters = dao.chapters(context.id)
                    val protected = leases.value.values.filter { it.scope == scope }.flatMap { it.keys }.toSet()
                    val skinHashes = chapters.map { it.skinHash }.toSet() + listOfNotNull(context.activeSkin)
                    val skins = dao.skins(context.id).filter {
                        if (it.hash in skinHashes || it.fileHash in protected) true else { dao.deleteSkin(context.id, it.hash); false }
                    }
                    val references = (chapters.flatMap { decodeResources(it.resourcesJson) } + skins.flatMap { decodeResources(it.resourcesJson) }).map { it.hash }.toSet()
                    val keep = references + chapters.map { it.fileHash } + skins.map { it.fileHash } + protected
                    dao.resources(context.id).filter { it.hash !in keep }.forEach { dao.deleteResource(context.id, it.hash) }
                    files.keys(scope).filter { it !in keep }.forEach { files.remove(scope, it) }
                }
                val retained = contexts.map { it.id }.toSet() + leases.value.values.filter { it.scope.owner == owner }.map { it.scope.context }
                files.contexts(owner).filter { it !in retained }.forEach { files.removeContext(OfflineFileScope(owner, it)) }
                }
            }
        }
    }

    suspend fun storageUsage(): OfflineStorageUsage = withContext(Dispatchers.IO) {
        mutex.withLock { accounts.offlineDatabases { offlineStorageUsage(inventories(it)) } }
    }

    suspend fun clearAutomatic() = withContext(Dispatchers.IO) {
        mutex.withLock {
            accounts.offlineDatabases { databases ->
                for ((_, database) in databases) database.useWriterConnection { writer -> writer.immediateTransaction {
                    val dao = database.offlineDao()
                    for (context in dao.contexts()) {
                        val pinned = dao.works(context.id).filter { it.pinned }.map { it.workId }.toSet()
                        dao.chapters(context.id).filter { it.workId !in pinned }.forEach { dao.deleteChapter(context.id, it.key) }
                        dao.works(context.id).filterNot { it.pinned }.forEach { dao.deleteWork(context.id, it.workId) }
                        dao.deletePrefetchJobs(context.id)
                    }
                } }
            }
        }
        collectUnusedFiles()
    }

    private suspend fun ensureAutomaticSpace(context: OfflineContext, chapter: OfflineChapterEntity?, skin: OfflineSkinEntity, resources: List<OfflineResource>, selectSkin: Boolean, isAllowed: () -> Boolean) {
        accounts.offlineDatabases { databases ->
            checkCurrent(context, isAllowed)
            val prospective = inventories(databases).map { inventory ->
                if (inventory.scope != context.files) inventory else inventory.copy(
                    chapters = inventory.chapters.filterNot { it.key == chapter?.key } + listOfNotNull(chapter),
                    skins = inventory.skins + (skin.hash to skin),
                    activeSkin = if (selectSkin) skin.hash else inventory.activeSkin,
                    fileSizes = inventory.fileSizes + resources.associate { it.hash to it.bytes } + mapOf(skin.fileHash to skin.bytes) + chapter?.let { mapOf(it.fileHash to it.bytes) }.orEmpty(),
                    protectedChapters = inventory.protectedChapters + listOfNotNull(chapter?.key)
                )
            }
            val evictions = automaticEvictions(prospective, automaticAllowance)
            for ((owner, database) in databases) {
                val ownerHash = offlineSha256(owner.encodeToByteArray())
                val chosen = evictions.filter { it.scope.owner == ownerHash }
                if (chosen.isNotEmpty()) database.useWriterConnection { writer -> writer.immediateTransaction {
                    checkCurrent(context, isAllowed)
                    chosen.forEach { database.offlineDao().deleteChapter(it.scope.context, it.key) }
                    checkCurrent(context, isAllowed)
                } }
            }
        }
    }

    private suspend fun inventories(databases: Map<String, Ao3Database>): List<OfflineInventory> {
        val result = mutableListOf<OfflineInventory>()
        for ((owner, database) in databases) {
            val dao = database.offlineDao()
            for (context in dao.contexts()) {
                val scope = OfflineFileScope(offlineSha256(owner.encodeToByteArray()), context.id)
                val chapters = dao.chapters(context.id)
                val skins = dao.skins(context.id)
                val leased = leases.value.values.filter { it.scope == scope }.flatMap { it.keys }.toSet()
                val promises = if (scope == selected.value?.files) dao.jobs(context.id).filter { it.mode == "prefetch" }.flatMap {
                    offlineJson.decodeFromString<List<String>>(it.remainingJson) + offlineJson.decodeFromString<List<String>>(it.completedJson)
                }.mapNotNull { url -> offlineLocation(url).chapterId?.let { chapterKey(url, it) } }.toSet() else emptySet()
                result.add(OfflineInventory(scope, chapters, skins.associateBy { it.hash }, context.activeSkin,
                    dao.works(context.id).filter { it.pinned }.map { it.workId }.toSet(),
                    chapters.associate { it.fileHash to it.bytes } + skins.associate { it.fileHash to it.bytes } +
                        dao.resources(context.id).associate { it.hash to it.bytes } + leased.associateWith { files.size(scope, it) },
                    leased, promises + listOfNotNull(protectedPage.value?.takeIf { it.scope == scope && scope == selected.value?.files }?.key)))
            }
        }
        return result
    }

    private fun checkCurrent(context: OfflineContext, isAllowed: () -> Boolean = { true }) {
        if (!isCurrent(context) || !isAllowed()) throw CancellationException("Offline context changed")
    }

    private suspend fun <T> forContext(context: OfflineContext, isAllowed: () -> Boolean = { true }, block: suspend (OfflineDao) -> T): T {
        checkCurrent(context, isAllowed)
        return accounts.forAccount(context.owner, { isCurrent(context) && isAllowed() }) {
            val dao = accounts.database.offlineDao()
            if (dao.selectedContext()?.id != context.id) throw CancellationException("Offline context was cleared")
            block(dao)
        }
    }

    private inline fun <reified T> readObject(scope: OfflineFileScope, hash: String): T? = runCatching {
        val bytes = files.read(scope, hash, OFFLINE_BUNDLE_LIMIT) ?: return null
        if (offlineSha256(bytes) != hash) return null
        offlineJson.decodeFromString<T>(bytes.decodeToString(throwOnInvalidSequence = true))
    }.getOrNull()

    private fun validResource(scope: OfflineFileScope, resource: OfflineResource): Boolean {
        val bytes = files.read(scope, resource.hash, OFFLINE_RESOURCE_LIMIT) ?: return false
        return bytes.size.toLong() == resource.bytes && offlineResourceHash(resource.mimeType, bytes) == resource.hash
    }

    private fun resourceClosure(scope: OfflineFileScope, text: List<String>, available: Map<String, OfflineResource>): List<OfflineResource> {
        val references = Regex("/resources/([a-f0-9]{64})")
        val found = mutableMapOf<String, OfflineResource>()
        fun visit(value: String) {
            for (match in references.findAll(value)) {
                val hash = match.groupValues[1]
                if (hash in found) continue
                val resource = requireNotNull(available[hash]) { "A saved resource is missing" }
                found[hash] = resource
                if (resource.mimeType == "text/css") visit(requireNotNull(files.read(scope, hash, OFFLINE_RESOURCE_LIMIT)).decodeToString())
            }
        }
        text.forEach(::visit)
        return found.values.toList()
    }

    private fun decodeResources(json: String): List<OfflineResource> = offlineJson.decodeFromString(json)
}

internal fun chapterKey(url: String, chapterId: String): String {
    val location = offlineLocation(url)
    val parameters = offlineJson.encodeToString(location.parameters.entries.filter { it.key != "view_full_work" }.sortedBy { it.key }.associate { it.key to it.value })
    val chapter = if (location.representation == "whole") "whole" else chapterId
    return offlineSha256("${location.workId}:$chapter:$parameters".encodeToByteArray())
}
