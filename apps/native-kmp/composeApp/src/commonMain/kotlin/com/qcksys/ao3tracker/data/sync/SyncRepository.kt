package com.qcksys.ao3tracker.data.sync

import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.database.Ao3Database
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.database.ChapterEntity
import com.qcksys.ao3tracker.data.database.WorkEntity
import com.qcksys.ao3tracker.data.database.TagEntity
import com.qcksys.ao3tracker.data.model.SyncChapterMetadata
import com.qcksys.ao3tracker.data.model.SyncChapterRequest
import com.qcksys.ao3tracker.data.model.SyncChapterResponse
import com.qcksys.ao3tracker.data.model.SyncFavouriteTagItem
import com.qcksys.ao3tracker.data.model.SyncGetResponse
import com.qcksys.ao3tracker.data.model.SyncPostRequest
import com.qcksys.ao3tracker.data.model.SyncResult
import com.qcksys.ao3tracker.data.model.SyncState
import com.qcksys.ao3tracker.data.model.SyncTagMetadata
import com.qcksys.ao3tracker.data.model.SyncWorkMetadata
import com.qcksys.ao3tracker.data.model.SyncWorkRequest
import com.qcksys.ao3tracker.data.model.SyncWorkResponse
import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.repository.RemoteFavouriteTag
import com.qcksys.ao3tracker.data.settings.SettingsStorage
import com.qcksys.ao3tracker.util.AppLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
class SyncRepository(
    private val syncService: SyncService,
    private val database: Ao3Database,
    private val settingsStorage: SettingsStorage,
    private val authRepository: AuthRepository,
    private val favouriteTagRepository: FavouriteTagRepository
) {
    private val workDao = database.workDao()
    private val chapterDao = database.chapterDao()
    private val tagDao = database.tagDao()

    // Repository-owned scope that survives screen lifecycle changes
    private val repositoryScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _syncState = MutableStateFlow(
        SyncState(lastSyncedAt = settingsStorage.getLastSyncTimestamp())
    )
    val syncState: StateFlow<SyncState> = _syncState.asStateFlow()

    private val _lastSyncResult = MutableStateFlow<SyncResult?>(null)
    val lastSyncResult: StateFlow<SyncResult?> = _lastSyncResult.asStateFlow()

    companion object {
        private const val TAG = "SyncRepository"
        private const val MAX_WORKS_PER_BATCH = 50
        private val NUMERIC_ENTITY_REGEX = Regex("&#(\\d+);")
        private val HEX_ENTITY_REGEX = Regex("&#x([0-9a-fA-F]+);")
    }

    /**
     * Performs a full bidirectional sync with the server using GET/POST pattern.
     *
     * Flow:
     * 1. GET all server data (paginate until hasMore is false)
     * 2. Merge server data into local database
     * 3. POST only items where lastReadAt > serverLastUpdated
     */
    suspend fun sync(): SyncResult {
        _syncState.value = _syncState.value.copy(isSyncing = true, statusMessage = "Starting sync...", error = null)
        AppLogger.d("Starting sync operation", TAG)

        // Get token from auth state
        val authState = authRepository.authState.value
        val token = (authState as? AuthState.Authenticated)?.token
        if (token == null) {
            AppLogger.w("Sync failed: Not authenticated", TAG)
            _syncState.value = _syncState.value.copy(
                isSyncing = false,
                statusMessage = null,
                error = "Please sign in to sync"
            )
            return SyncResult.NotAuthenticated
        }

        return try {
            val lastSyncedAt = settingsStorage.getLastSyncTimestamp()
            AppLogger.d("Last sync timestamp: ${lastSyncedAt ?: "none (full sync)"}", TAG)

            _syncState.value = _syncState.value.copy(statusMessage = "Fetching data from server...")
            val fetchResult = fetchAllServerData(token, lastSyncedAt)
            if (fetchResult.isFailure) {
                return handleSyncError(fetchResult.exceptionOrNull()!!)
            }

            val (serverData, serverLastUpdated) = fetchResult.getOrThrow()
            AppLogger.d("Fetched ${serverData.works.size} works, ${serverData.chapters.size} chapters from server", TAG)
            AppLogger.d("Server latestWorkLastReadAt: ${serverData.latestWorkLastReadAt ?: "null (no server tracks)"}", TAG)

            // Order matters: apply tracking data first (lastReadAt), then layer metadata on top.
            _syncState.value = _syncState.value.copy(statusMessage = "Applying server changes...")
            applyServerWorkChanges(serverData.works)
            applyServerWorkMetadata(serverData.workMetadata)
            applyServerChapterChanges(serverData.chapters)
            applyServerChapterMetadata(serverData.chapterMetadata)
            applyServerTagMetadata(serverData.tagMetadata)
            if (serverData.favouriteTags.isNotEmpty()) {
                favouriteTagRepository.applyRemote(
                    serverData.favouriteTags.map {
                        RemoteFavouriteTag(
                            tagType = it.tagType,
                            tag = it.tag,
                            favourited = it.favourited,
                            updatedAt = parseIso8601(it.updatedAt)
                        )
                    }
                )
            }

            // For full sync (lastSyncedAt was null), send ALL local data; for
            // incremental sync, send changes since last sync.
            _syncState.value = _syncState.value.copy(statusMessage = "Preparing local changes...")
            val lastSyncTimestamp = lastSyncedAt?.let { parseIso8601(it) }
            val localWorks = getLocalWorkChanges(lastSyncTimestamp)
            val localChapters = getLocalChapterChanges(lastSyncTimestamp)
            val pendingFavouriteEntities = favouriteTagRepository.getPendingSync()
            val pendingFavouriteTags = pendingFavouriteEntities.map { entity ->
                SyncFavouriteTagItem(
                    tagType = entity.tagType,
                    tag = entity.tag,
                    favourited = entity.favourited,
                    updatedAt = toIso8601(entity.updatedAt)
                )
            }
            AppLogger.d(
                "Local changes to sync: ${localWorks.size} works, ${localChapters.size} chapters, ${pendingFavouriteTags.size} favourite tags",
                TAG
            )

            if (localWorks.isNotEmpty() || localChapters.isNotEmpty() || pendingFavouriteTags.isNotEmpty()) {
                _syncState.value = _syncState.value.copy(
                    statusMessage = "Sending ${localWorks.size} works, ${localChapters.size} chapters, ${pendingFavouriteTags.size} favourites..."
                )
                val postResult = sendLocalChanges(
                    token,
                    localWorks,
                    localChapters,
                    pendingFavouriteTags
                )
                if (postResult.isFailure) {
                    return handleSyncError(postResult.exceptionOrNull()!!)
                }
                // Clear pendingSync on rows the server accepted (or that we sent —
                // server ignored just means our row was stale; either way local
                // matches server now via applyRemote in a later pull).
                for (entity in pendingFavouriteEntities) {
                    favouriteTagRepository.markSynced(entity.tagType, entity.tag)
                }
            }

            settingsStorage.setLastSyncTimestamp(serverLastUpdated)
            _syncState.value = _syncState.value.copy(
                lastSyncedAt = serverLastUpdated,
                isSyncing = false,
                statusMessage = null,
                error = null
            )

            AppLogger.d("Sync completed: ${serverData.works.size} works, ${serverData.chapters.size} chapters from server; ${localWorks.size} works, ${localChapters.size} chapters to server", TAG)
            SyncResult.Success(
                worksFromServer = serverData.works.size,
                chaptersFromServer = serverData.chapters.size,
                worksToServer = localWorks.size,
                chaptersToServer = localChapters.size,
                syncedAt = serverLastUpdated
            )
        } catch (e: Exception) {
            AppLogger.e("Sync exception: ${e.message}", TAG, e)
            _syncState.value = _syncState.value.copy(
                isSyncing = false,
                statusMessage = null,
                error = e.message
            )
            SyncResult.Error(e.message ?: "Sync failed")
        }
    }

    /**
     * Forces a full sync by clearing the last sync timestamp.
     * Launches in repository scope to survive screen lifecycle changes.
     */
    fun forceFullSync() {
        if (_syncState.value.isSyncing) {
            AppLogger.d("Sync already in progress, skipping", TAG)
            return
        }
        repositoryScope.launch {
            settingsStorage.setLastSyncTimestamp(null)
            _syncState.value = _syncState.value.copy(lastSyncedAt = null)
            val result = sync()
            _lastSyncResult.value = result
        }
    }

    /**
     * Clears the last sync result after it has been consumed by the UI.
     */
    fun clearLastSyncResult() {
        _lastSyncResult.value = null
    }

    /**
     * Fetches all server data with pagination until hasMore is false.
     * Returns aggregated data and serverLastUpdated timestamp.
     * Note: Only works are paginated - all chapters and tags for returned works are included in each response.
     */
    private suspend fun fetchAllServerData(token: String, lastSyncedAt: String?): Result<Pair<AggregatedSyncData, String>> {
        val allWorks = mutableListOf<SyncWorkResponse>()
        val allChapters = mutableListOf<SyncChapterResponse>()
        val allWorkMetadata = mutableListOf<SyncWorkMetadata>()
        val allChapterMetadata = mutableListOf<SyncChapterMetadata>()
        val allTagMetadata = mutableListOf<SyncTagMetadata>()
        // Favourite tags only come back on the first page (workCursor == null in request).
        var favouriteTags: List<SyncFavouriteTagItem> = emptyList()

        var workCursor: Long? = null
        var hasMore = true
        var serverLastUpdated: String? = null
        var latestWorkLastReadAt: String? = null

        while (hasMore) {
            val result = syncService.fetchSyncData(
                token = token,
                lastSyncedAt = lastSyncedAt,
                workCursor = workCursor,
                limit = MAX_WORKS_PER_BATCH // API max is 50
            )

            if (result.isFailure) {
                return Result.failure(result.exceptionOrNull()!!)
            }

            val response = result.getOrThrow()
            allWorks.addAll(response.works)
            allChapters.addAll(response.chapters)
            allWorkMetadata.addAll(response.workMetadata)
            allChapterMetadata.addAll(response.chapterMetadata)
            allTagMetadata.addAll(response.tagMetadata)
            // Capture favouriteTags from the first response only (subsequent pages omit it).
            if (workCursor == null) {
                favouriteTags = response.favouriteTags ?: emptyList()
            }

            serverLastUpdated = response.serverLastUpdated
            latestWorkLastReadAt = response.latestWorkLastReadAt
            hasMore = response.hasMore
            workCursor = response.nextWorkCursor
        }

        return Result.success(
            AggregatedSyncData(
                works = allWorks,
                chapters = allChapters,
                workMetadata = allWorkMetadata,
                chapterMetadata = allChapterMetadata,
                tagMetadata = allTagMetadata,
                latestWorkLastReadAt = latestWorkLastReadAt,
                favouriteTags = favouriteTags
            ) to (serverLastUpdated ?: Clock.System.now().toString())
        )
    }

    /**
     * Sends local changes to server in batches of MAX_WORKS_PER_BATCH.
     * Favourite tags are attached to the first batch only — they're a small set
     * with no batching needs, and sending them once avoids duplicate processing.
     */
    private suspend fun sendLocalChanges(
        token: String,
        works: List<SyncWorkRequest>,
        chapters: List<SyncChapterRequest>,
        favouriteTags: List<SyncFavouriteTagItem>
    ): Result<Unit> {
        if (works.isEmpty() && chapters.isEmpty() && favouriteTags.isEmpty()) {
            return Result.success(Unit)
        }

        // Group chapters by workId for batching
        val chaptersByWorkId = chapters.groupBy { it.workId }

        // If we have favourites but no works/chapters, send them in a standalone request.
        if (works.isEmpty() && chapters.isEmpty()) {
            val request = SyncPostRequest(
                works = emptyList(),
                chapters = emptyList(),
                favouriteTags = favouriteTags
            )
            val result = syncService.sendSyncData(token, request)
            return if (result.isFailure) Result.failure(result.exceptionOrNull()!!) else Result.success(Unit)
        }

        var firstBatch = true
        // Send works in batches of MAX_WORKS_PER_BATCH with their chapters
        for (i in works.indices step MAX_WORKS_PER_BATCH) {
            val workBatch = works.subList(i, minOf(i + MAX_WORKS_PER_BATCH, works.size))
            val workIds = workBatch.map { it.workId }.toSet()
            val chapterBatch = chapters.filter { it.workId in workIds }

            val request = SyncPostRequest(
                works = workBatch,
                chapters = chapterBatch,
                favouriteTags = if (firstBatch) favouriteTags.ifEmpty { null } else null
            )
            firstBatch = false

            val result = syncService.sendSyncData(token, request)
            if (result.isFailure) {
                return Result.failure(result.exceptionOrNull()!!)
            }
        }

        // Send any orphan chapters (chapters without corresponding works in this sync)
        val syncedWorkIds = works.map { it.workId }.toSet()
        val orphanChapters = chapters.filter { it.workId !in syncedWorkIds }
        if (orphanChapters.isNotEmpty()) {
            // Group orphan chapters by work and send
            val orphanWorkIds = orphanChapters.map { it.workId }.distinct()
            for (workId in orphanWorkIds) {
                val workChapters = orphanChapters.filter { it.workId == workId }
                // Create a minimal work request to satisfy the API requirement
                val localWork = workDao.getWorkById(workId)
                if (localWork != null) {
                    val request = SyncPostRequest(
                        works = listOf(
                            SyncWorkRequest(
                                workId = workId,
                                lastReadAt = toIso8601(localWork.lastRead ?: Clock.System.now().toEpochMilliseconds()),
                                markedCompleteAt = localWork.markedCompleteAt?.let { toIso8601(it) },
                                private = localWork.isPrivate,
                                subscribed = localWork.subscribed,
                                subscribedUpdatedAt = localWork.subscribedUpdatedAt?.let { toIso8601(it) },
                                favourite = localWork.favourite,
                                favouriteUpdatedAt = localWork.favouriteUpdatedAt?.let { toIso8601(it) },
                                deleted = localWork.rowDeletedAt != null
                            )
                        ),
                        chapters = workChapters
                    )
                    val result = syncService.sendSyncData(token, request)
                    if (result.isFailure) {
                        return Result.failure(result.exceptionOrNull()!!)
                    }
                }
            }
        }

        return Result.success(Unit)
    }

    private fun handleSyncError(error: Throwable): SyncResult {
        return when (error) {
            is UnauthorizedException -> {
                AppLogger.w("Sync failed: Not authenticated", TAG)
                authRepository.invalidateSession()
                _syncState.value = _syncState.value.copy(
                    isSyncing = false,
                    statusMessage = null,
                    error = "Please sign in to sync"
                )
                SyncResult.NotAuthenticated
            }
            else -> {
                AppLogger.e("Sync failed: ${error.message}", TAG, error)
                _syncState.value = _syncState.value.copy(
                    isSyncing = false,
                    statusMessage = null,
                    error = error.message
                )
                SyncResult.Error(error.message ?: "Sync failed")
            }
        }
    }

    /**
     * Gets local work changes to sync.
     * For full sync (lastSyncTimestamp is null), returns ALL local works including deleted ones.
     * For incremental sync, returns works where rowUpdatedAt >= lastSyncTimestamp.
     * Note: Must include deleted works so server learns about deletions.
     */
    private suspend fun getLocalWorkChanges(lastSyncTimestamp: Long?): List<SyncWorkRequest> {
        val works = workDao.getAllWorksIncludingDeletedOnce()
            .filter { it.lastRead != null && (lastSyncTimestamp == null || it.rowUpdatedAt >= lastSyncTimestamp) }
        if (lastSyncTimestamp == null) {
            AppLogger.d("Full sync - sending ${works.size} local works (including ${works.count { it.rowDeletedAt != null }} deleted)", TAG)
        }
        return works.map(::workToSyncRequest)
    }

    /**
     * Gets local chapter changes to sync.
     * For full sync (lastSyncTimestamp is null), returns ALL local chapters including deleted ones.
     * For incremental sync, returns chapters where rowUpdatedAt >= lastSyncTimestamp.
     * Note: Chapters with chapterId == 0 are single-chapter works.
     * Note: Must include deleted chapters so server learns about deletions.
     */
    private suspend fun getLocalChapterChanges(lastSyncTimestamp: Long?): List<SyncChapterRequest> {
        val chapters = chapterDao.getAllChaptersIncludingDeletedOnce()
            .filter { it.lastReadAt != null && (lastSyncTimestamp == null || it.rowUpdatedAt >= lastSyncTimestamp) }
        if (lastSyncTimestamp == null) {
            AppLogger.d("Full sync - sending ${chapters.size} read chapters (including ${chapters.count { it.rowDeletedAt != null }} deleted)", TAG)
        }
        return chapters.map(::chapterToSyncRequest)
    }

    /**
     * Aggregated sync data from multiple paginated GET responses.
     */
    private data class AggregatedSyncData(
        val works: List<SyncWorkResponse>,
        val chapters: List<SyncChapterResponse>,
        val workMetadata: List<SyncWorkMetadata>,
        val chapterMetadata: List<SyncChapterMetadata>,
        val tagMetadata: List<SyncTagMetadata>,
        /** ISO 8601 timestamp of most recent work lastReadAt, or null if user has no tracked works */
        val latestWorkLastReadAt: String?,
        val favouriteTags: List<SyncFavouriteTagItem>
    )

    /**
     * Applies server work metadata to local database.
     * Creates or updates work entities with full metadata from server.
     */
    private suspend fun applyServerWorkMetadata(serverMetadata: List<SyncWorkMetadata>) {
        val now = Clock.System.now().toEpochMilliseconds()

        for (metadata in serverMetadata) {
            val existingWork = workDao.getWorkById(metadata.id)

            val workEntity = WorkEntity(
                id = metadata.id,
                title = metadata.title,
                author = metadata.author,
                authorUrl = metadata.authorUrl,
                summary = metadata.summary,
                language = metadata.language,
                wordCount = metadata.wordCount,
                currentChapters = metadata.currentChapters,
                totalChapters = metadata.totalChapters,
                hits = metadata.hits,
                kudos = metadata.kudos,
                bookmarks = metadata.bookmarks,
                comments = metadata.comments,
                published = parseIso8601(metadata.published),
                lastUpdated = parseIso8601(metadata.lastUpdated),
                lastRefreshed = now,
                downloadPath = metadata.downloadPath,
                downloadUpdatedAt = metadata.downloadUpdatedAt,
                isPrivate = existingWork?.isPrivate ?: false,
                subscribed = existingWork?.subscribed ?: true,
                subscribedUpdatedAt = existingWork?.subscribedUpdatedAt,
                favourite = existingWork?.favourite ?: false,
                favouriteUpdatedAt = existingWork?.favouriteUpdatedAt,
                lastRead = existingWork?.lastRead ?: now,
                markedCompleteAt = existingWork?.markedCompleteAt,
                rowCreatedAt = existingWork?.rowCreatedAt ?: now,
                rowUpdatedAt = now,
                rowDeletedAt = existingWork?.rowDeletedAt
            )

            workDao.upsertWork(workEntity)
            AppLogger.d("Applied work metadata for work ${metadata.id}: ${metadata.title}", TAG)
        }
    }

    /**
     * Applies server chapter metadata to local database.
     * Only updates EXISTING chapter entries with metadata - does not create new chapters.
     * Chapters are created by applyServerChapterChanges when they have reading progress.
     */
    private suspend fun applyServerChapterMetadata(serverMetadata: List<SyncChapterMetadata>) {
        val now = Clock.System.now().toEpochMilliseconds()

        for (metadata in serverMetadata) {
            val existingChapter = chapterDao.getChapterById(metadata.id, metadata.workId)

            // Only update existing chapters - don't create new ones just for metadata
            if (existingChapter == null) continue

            val chapterEntity = ChapterEntity(
                workId = metadata.workId,
                chapterId = metadata.id,
                number = metadata.number,
                title = metadata.title,
                dateUpdated = metadata.dateUpdated?.let { parseIso8601(it) },
                readProgress = existingChapter.readProgress,
                lastReadAt = existingChapter.lastReadAt,
                markedCompleteAt = existingChapter.markedCompleteAt,
                rowCreatedAt = existingChapter.rowCreatedAt,
                rowUpdatedAt = now,
                rowDeletedAt = existingChapter.rowDeletedAt
            )

            chapterDao.upsertChapter(chapterEntity)
        }
    }

    /**
     * Applies server tag metadata to local database.
     * Creates or updates tag entities from server.
     */
    private suspend fun applyServerTagMetadata(serverMetadata: List<SyncTagMetadata>) {
        val now = Clock.System.now().toEpochMilliseconds()

        // Group tags by workId to process efficiently
        val tagsByWork = serverMetadata.groupBy { it.workId }

        for ((workId, tags) in tagsByWork) {
            val tagEntities = tags.map { tag ->
                TagEntity(
                    workId = workId,
                    tag = decodeHtmlEntities(tag.tag),
                    href = tag.href,
                    typeId = TagType.fromString(tag.type).id,
                    rowCreatedAt = now
                )
            }

            // Upsert all tags for this work
            tagDao.upsertTags(tagEntities)
            AppLogger.d("Applied ${tagEntities.size} tags for work $workId", TAG)
        }
    }

    /**
     * Decodes common HTML entities in a string.
     * Handles: &amp; &lt; &gt; &quot; &#39; &apos; and numeric entities like &#123;
     */
    private fun decodeHtmlEntities(text: String): String {
        return text
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&apos;", "'")
            .replace("&nbsp;", " ")
            .replace(NUMERIC_ENTITY_REGEX) { matchResult ->
                val code = matchResult.groupValues[1].toIntOrNull()
                if (code != null) code.toChar().toString() else matchResult.value
            }
            .replace(HEX_ENTITY_REGEX) { matchResult ->
                val code = matchResult.groupValues[1].toIntOrNull(16)
                if (code != null) code.toChar().toString() else matchResult.value
            }
    }

    /**
     * Applies server work changes to local database.
     * Uses "last write wins" conflict resolution based on timestamps.
     * Handles deletions when `deleted: true` is received from server.
     * Preserves local deletions that haven't been synced to server yet.
     */
    private suspend fun applyServerWorkChanges(serverWorks: List<SyncWorkResponse>): Int {
        var updatedCount = 0
        val now = Clock.System.now().toEpochMilliseconds()

        for (serverWork in serverWorks) {
            // Use method that includes deleted works to properly detect local deletions
            val localWork = workDao.getWorkByIdIncludingDeleted(serverWork.workId)
            val serverLastReadAt = parseIso8601(serverWork.lastReadAt)

            // Handle deletion from server
            if (serverWork.deleted) {
                if (localWork != null && localWork.rowDeletedAt == null) {
                    workDao.softDeleteWork(
                        id = serverWork.workId,
                        rowDeletedAt = now,
                        rowUpdatedAt = now
                    )
                    updatedCount++
                }
                continue
            }

            // If work is locally deleted but server says not deleted,
            // preserve the local deletion - it will be synced to server in POST step
            if (localWork != null && localWork.rowDeletedAt != null) {
                AppLogger.d("Preserving local deletion for work ${serverWork.workId} - will sync to server", TAG)
                continue
            }

            if (localWork == null) {
                // Create a minimal work entry - full metadata will come from WebView (if not private)
                workDao.upsertWork(
                    WorkEntity(
                        id = serverWork.workId,
                        isPrivate = serverWork.private,
                        subscribed = serverWork.subscribed,
                        subscribedUpdatedAt = serverWork.subscribedUpdatedAt?.let { parseIso8601(it) },
                        favourite = serverWork.favourite,
                        favouriteUpdatedAt = serverWork.favouriteUpdatedAt?.let { parseIso8601(it) },
                        lastRead = serverLastReadAt,
                        markedCompleteAt = serverWork.markedCompleteAt?.let { parseIso8601(it) },
                        rowCreatedAt = now,
                        rowUpdatedAt = now,
                        rowDeletedAt = null
                    )
                )
                updatedCount++
            } else {
                // Update if server has newer data
                val localLastRead = localWork.lastRead ?: 0L
                if (serverLastReadAt > localLastRead) {
                    workDao.updateLastRead(
                        id = serverWork.workId,
                        lastRead = serverLastReadAt,
                        rowUpdatedAt = now
                    )
                    updatedCount++
                }

                // Handle markedCompleteAt (finished reading status, separate from deletion)
                serverWork.markedCompleteAt?.let { markedComplete ->
                    val serverMarkedCompleteAt = parseIso8601(markedComplete)
                    val localMarkedCompleteAt = localWork.markedCompleteAt ?: 0L
                    if (serverMarkedCompleteAt > localMarkedCompleteAt) {
                        workDao.markWorkComplete(
                            id = serverWork.workId,
                            markedCompleteAt = serverMarkedCompleteAt,
                            rowUpdatedAt = now
                        )
                    }
                }

                applyServerLwwField(
                    serverValue = serverWork.subscribed,
                    serverTimestamp = serverWork.subscribedUpdatedAt?.let { parseIso8601(it) },
                    localValue = localWork.subscribed,
                    localTimestamp = localWork.subscribedUpdatedAt,
                    now = now,
                ) { value, ts ->
                    workDao.updateSubscription(
                        id = serverWork.workId,
                        subscribed = value,
                        subscribedUpdatedAt = ts,
                        rowUpdatedAt = now
                    )
                }

                applyServerLwwField(
                    serverValue = serverWork.favourite,
                    serverTimestamp = serverWork.favouriteUpdatedAt?.let { parseIso8601(it) },
                    localValue = localWork.favourite,
                    localTimestamp = localWork.favouriteUpdatedAt,
                    now = now,
                ) { value, ts ->
                    workDao.updateFavourite(
                        id = serverWork.workId,
                        favourite = value,
                        favouriteUpdatedAt = ts,
                        rowUpdatedAt = now
                    )
                }
            }
        }

        return updatedCount
    }

    /**
     * Applies server chapter changes to local database.
     * Handles deletions when `deleted: true` is received from server.
     * Preserves local deletions that haven't been synced to server yet.
     */
    private suspend fun applyServerChapterChanges(serverChapters: List<SyncChapterResponse>): Int {
        var updatedCount = 0
        val now = Clock.System.now().toEpochMilliseconds()

        for (serverChapter in serverChapters) {
            // Use method that includes deleted chapters to properly detect local deletions
            val localChapter = chapterDao.getChapterByIdIncludingDeleted(serverChapter.chapterId, serverChapter.workId)
            val serverLastReadAt = parseIso8601(serverChapter.lastReadAt)

            // Handle deletion from server
            if (serverChapter.deleted) {
                if (localChapter != null && localChapter.rowDeletedAt == null) {
                    chapterDao.softDeleteChapter(
                        chapterId = serverChapter.chapterId,
                        workId = serverChapter.workId,
                        rowDeletedAt = now,
                        rowUpdatedAt = now
                    )
                    updatedCount++
                }
                continue
            }

            // If chapter is locally deleted but server says not deleted,
            // preserve the local deletion - it will be synced to server in POST step
            if (localChapter != null && localChapter.rowDeletedAt != null) {
                AppLogger.d("Preserving local deletion for chapter ${serverChapter.chapterId} of work ${serverChapter.workId} - will sync to server", TAG)
                continue
            }

            if (localChapter == null) {
                // Create chapter entry
                chapterDao.upsertChapter(
                    ChapterEntity(
                        workId = serverChapter.workId,
                        chapterId = serverChapter.chapterId,
                        readProgress = serverChapter.readProgress,
                        lastReadAt = serverLastReadAt,
                        markedCompleteAt = serverChapter.markedCompleteAt?.let { parseIso8601(it) },
                        rowCreatedAt = now,
                        rowUpdatedAt = now,
                        rowDeletedAt = null
                    )
                )
                updatedCount++
            } else {
                // Update if server has newer data or higher progress
                val localLastRead = localChapter.lastReadAt ?: 0L
                val localProgress = localChapter.readProgress ?: 0f

                if (serverLastReadAt > localLastRead || serverChapter.readProgress > localProgress) {
                    chapterDao.updateChapterProgress(
                        chapterId = serverChapter.chapterId,
                        workId = serverChapter.workId,
                        progress = maxOf(serverChapter.readProgress, localProgress),
                        lastReadAt = maxOf(serverLastReadAt, localLastRead),
                        rowUpdatedAt = now
                    )
                    updatedCount++
                }

                // Handle marking complete (update markedCompleteAt field, not soft delete)
                serverChapter.markedCompleteAt?.let { markedComplete ->
                    val serverMarkedCompleteAt = parseIso8601(markedComplete)
                    val localMarkedCompleteAt = localChapter.markedCompleteAt ?: 0L
                    if (serverMarkedCompleteAt > localMarkedCompleteAt) {
                        chapterDao.markChapterComplete(
                            chapterId = serverChapter.chapterId,
                            workId = serverChapter.workId,
                            markedCompleteAt = serverMarkedCompleteAt,
                            rowUpdatedAt = now
                        )
                    }
                }
            }
        }

        return updatedCount
    }

    /**
     * Per-field LWW resolution. If only one side has an explicit timestamp it
     * wins; if both have one, the higher wins (server wins on tie since the
     * comparison is `serverTs >= localTs`); if neither has one, no update.
     * Mirrors `resolveLWW` on the server (apps/api/src/db/helpers/lww.ts).
     */
    private suspend fun <T> applyServerLwwField(
        serverValue: T,
        serverTimestamp: Long?,
        localValue: T,
        localTimestamp: Long?,
        now: Long,
        update: suspend (value: T, timestamp: Long) -> Unit,
    ) {
        if (serverValue == localValue) return
        val shouldUpdate = when {
            serverTimestamp != null && localTimestamp != null -> serverTimestamp >= localTimestamp
            serverTimestamp != null -> true
            localTimestamp != null -> false
            else -> false
        }
        if (shouldUpdate) update(serverValue, serverTimestamp ?: now)
    }

    private fun workToSyncRequest(work: WorkEntity): SyncWorkRequest = SyncWorkRequest(
        workId = work.id,
        lastReadAt = toIso8601(work.lastRead!!),
        markedCompleteAt = work.markedCompleteAt?.let { toIso8601(it) },
        private = work.isPrivate,
        subscribed = work.subscribed,
        subscribedUpdatedAt = work.subscribedUpdatedAt?.let { toIso8601(it) },
        favourite = work.favourite,
        favouriteUpdatedAt = work.favouriteUpdatedAt?.let { toIso8601(it) },
        deleted = work.rowDeletedAt != null
    )

    private fun chapterToSyncRequest(chapter: ChapterEntity): SyncChapterRequest = SyncChapterRequest(
        workId = chapter.workId,
        chapterId = chapter.chapterId,
        lastReadAt = toIso8601(chapter.lastReadAt!!),
        markedCompleteAt = chapter.markedCompleteAt?.let { toIso8601(it) },
        readProgress = chapter.readProgress ?: 0f,
        deleted = chapter.rowDeletedAt != null
    )

    /**
     * Converts an epoch milliseconds timestamp to ISO 8601 format.
     */
    private fun toIso8601(epochMillis: Long): String {
        return Instant.fromEpochMilliseconds(epochMillis).toString()
    }

    /**
     * Parses an ISO 8601 timestamp to epoch milliseconds. On failure logs and
     * returns 0L so a single bad timestamp from the server doesn't crash a
     * sync — but downstream LWW will treat the row as ancient, so the warn
     * lets us spot the bad data.
     */
    private fun parseIso8601(iso8601: String): Long {
        return try {
            Instant.parse(iso8601).toEpochMilliseconds()
        } catch (e: Exception) {
            AppLogger.w("Failed to parse ISO 8601 timestamp: $iso8601", TAG, e)
            0L
        }
    }
}
