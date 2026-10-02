package com.qcksys.ao3tracker.data.repository

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.ChapterEntity
import com.qcksys.ao3tracker.data.database.TagEntity
import com.qcksys.ao3tracker.data.database.WorkEntity
import com.qcksys.ao3tracker.data.model.Chapter
import com.qcksys.ao3tracker.data.model.ExportData
import com.qcksys.ao3tracker.data.model.FilterState
import com.qcksys.ao3tracker.data.model.ReadingStatus
import com.qcksys.ao3tracker.data.model.ScrollProgressEvent
import com.qcksys.ao3tracker.data.model.Tag
import com.qcksys.ao3tracker.data.model.TagFilterMode
import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.data.model.Work
import com.qcksys.ao3tracker.data.model.WorkBadgePayload
import com.qcksys.ao3tracker.data.model.WorkChapterIndexEvent
import com.qcksys.ao3tracker.data.model.WorkInfoEvent
import com.qcksys.ao3tracker.data.model.WorkTagsEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

class Ao3Repository(private val accountData: AccountDataStore) {
    private val workDao get() = accountData.database.workDao()
    private val chapterDao get() = accountData.database.chapterDao()
    private val tagDao get() = accountData.database.tagDao()

    /**
     * Gets all works with their chapters using batch loading to avoid N+1 queries.
     */
    fun getAllWorks(): Flow<List<Work>> = accountData.observe { database ->
        val workDao = database.workDao()
        val chapterDao = database.chapterDao()
        workDao.getAllWorks().map { works ->
            if (works.isEmpty()) return@map emptyList()

            // Batch load all chapters for all works in a single query
            val workIds = works.map { it.id }
            val allChapters = chapterDao.getChaptersByWorkIds(workIds)
            val chaptersByWorkId = allChapters.groupBy { it.workId }

            works.map { work ->
                val chapters = chaptersByWorkId[work.id] ?: emptyList()
                work.toDomain(chapters.map { it.toDomain() })
            }
        }
    }

    fun getWorkById(id: Long): Flow<Work?> = accountData.observe { database ->
        val workDao = database.workDao()
        val chapterDao = database.chapterDao()
        val tagDao = database.tagDao()
        combine(
            workDao.getWorkByIdFlow(id),
            chapterDao.getChaptersByWork(id),
            tagDao.getTagsByWork(id)
        ) { work, chapters, tags ->
            work?.toDomain(chapters.map { it.toDomain() }, tags.map { it.toDomain() })
        }
    }

    suspend fun getWorkByIdOnce(id: Long): Work? = accountData.read {
        val work = workDao.getWorkById(id) ?: return@read null
        val chapters = chapterDao.getChaptersByWorkOnce(id)
        val tags = tagDao.getTagsByWorkOnce(id)
        work.toDomain(chapters.map { it.toDomain() }, tags.map { it.toDomain() })
    }

    /**
     * Gets filtered works with optimized batch loading.
     */
    fun getFilteredWorks(filterState: FilterState): Flow<List<Work>> = accountData.observe { database ->
        val workDao = database.workDao()
        val chapterDao = database.chapterDao()
        val tagDao = database.tagDao()
        val baseFlow = if (filterState.searchQuery.isNotBlank()) {
            workDao.searchWorks(filterState.searchQuery)
        } else {
            workDao.getAllWorks()
        }

        combine(baseFlow, database.invalidationTracker.createFlow("chapters", "tags")) { works, _ ->
            if (works.isEmpty()) return@combine emptyList()

            val workIds = works.map { it.id }

            // Batch load chapters and tags
            val allChapters = chapterDao.getChaptersByWorkIds(workIds)
            val chaptersByWorkId = allChapters.groupBy { it.workId }

            val tagsByWorkId = tagDao.getTagsByWorkIds(workIds).groupBy { it.workId }

            works.mapNotNull { work ->
                val chapters = chaptersByWorkId[work.id] ?: emptyList()
                val workTags = tagsByWorkId[work.id] ?: emptyList()
                val domainWork = work.toDomain(
                    chapters.map { it.toDomain() },
                    workTags.map { it.toDomain() }
                )

                // Apply tag filters if any are active
                if (filterState.hasActiveTagFilters) {
                    if (!matchesTagFilters(workTags, filterState)) {
                        return@mapNotNull null
                    }
                }

                // Apply reading status filters if any are active
                if (filterState.hasActiveReadingStatusFilters) {
                    if (!matchesReadingStatusFilters(domainWork, filterState)) {
                        return@mapNotNull null
                    }
                }

                domainWork
            }
        }
    }

    /**
     * Checks if work tags match the filter criteria with include/exclude logic.
     */
    private fun matchesTagFilters(tags: List<TagEntity>, filterState: FilterState): Boolean {
        val tagsByType = tags.groupBy { it.typeId }

        // Helper function to check if work matches a filter map with include/exclude logic
        fun matchesFilter(typeId: Int, filters: Map<String, TagFilterMode>): Boolean {
            val workTags = tagsByType[typeId]?.map { it.tag }?.toSet() ?: emptySet()
            val includedTags = filterState.getIncludedTags(filters)
            val excludedTags = filterState.getExcludedTags(filters)

            // All included tags must be present (AND logic)
            if (includedTags.isNotEmpty() && !workTags.containsAll(includedTags)) {
                return false
            }

            // No excluded tags should be present (NOT logic)
            if (excludedTags.isNotEmpty() && workTags.any { it in excludedTags }) {
                return false
            }

            return true
        }

        return matchesFilter(TagType.RATING.id, filterState.ratingFilters) &&
                matchesFilter(TagType.WARNING.id, filterState.warningFilters) &&
                matchesFilter(TagType.CATEGORY.id, filterState.categoryFilters) &&
                matchesFilter(TagType.FANDOM.id, filterState.fandomFilters) &&
                matchesFilter(TagType.RELATIONSHIP.id, filterState.relationshipFilters) &&
                matchesFilter(TagType.CHARACTER.id, filterState.characterFilters) &&
                matchesFilter(TagType.FREEFORM.id, filterState.freeformFilters)
    }

    /**
     * Checks if work matches reading status filters.
     */
    private fun matchesReadingStatusFilters(work: Work, filterState: FilterState): Boolean {
        val includedStatuses = filterState.getIncludedReadingStatuses()
        val excludedStatuses = filterState.getExcludedReadingStatuses()

        // Determine work's reading status(es)
        val workStatuses = mutableSetOf<ReadingStatus>()

        val hasProgress = work.chapterList.any { (it.readProgress ?: 0f) > 0f }
        val currentChapters = work.currentChapters ?: work.chapterList.size
        val totalChapters = work.totalChapters
        val readChaptersCount = work.chapterList.count { it.isComplete }
        val isWorkComplete = totalChapters != null && currentChapters >= totalChapters
        val hasReadAllAvailable = readChaptersCount >= currentChapters && currentChapters > 0
        val hasNewChapters = work.markedCompleteAt != null &&
            currentChapters > readChaptersCount && readChaptersCount > 0

        if (!hasProgress) {
            workStatuses.add(ReadingStatus.NOT_STARTED)
        } else if (hasReadAllAvailable && isWorkComplete) {
            // Read all chapters of a complete work
            workStatuses.add(ReadingStatus.FINISHED)
        } else if (hasReadAllAvailable && !isWorkComplete) {
            // Read all available chapters but work is incomplete (more expected)
            workStatuses.add(ReadingStatus.CAUGHT_UP)
        } else {
            workStatuses.add(ReadingStatus.IN_PROGRESS)
        }

        if (hasNewChapters) {
            workStatuses.add(ReadingStatus.HAS_NEW_CHAPTERS)
        }

        if (work.isPrivate) {
            workStatuses.add(ReadingStatus.PRIVATE)
        }

        // Work completion status (author's posting status)
        if (isWorkComplete) {
            workStatuses.add(ReadingStatus.WORK_COMPLETED)
        }

        // Favourite status
        if (work.favourite) {
            workStatuses.add(ReadingStatus.FAVOURITE)
        }

        // Subscribed status
        if (work.subscribed) {
            workStatuses.add(ReadingStatus.SUBSCRIBED)
        }

        // All included statuses must match (work must have at least one)
        if (includedStatuses.isNotEmpty() && !workStatuses.any { it in includedStatuses }) {
            return false
        }

        // No excluded statuses should match
        if (excludedStatuses.isNotEmpty() && workStatuses.any { it in excludedStatuses }) {
            return false
        }

        return true
    }

    fun getDistinctTags(type: TagType): Flow<List<String>> = accountData.observe {
        it.tagDao().getDistinctTagsByType(type.id)
    }

    suspend fun addTrackedWork(
        workId: Long,
        title: String?,
        isCurrentOperation: () -> Boolean = { true }
    ) = accountData.edit(isCurrentOperation) {
        if (workId <= 0) return@edit
        val existing = workDao.getWorkByIdIncludingDeleted(workId)
        if (existing != null && existing.rowDeletedAt == null) return@edit
        val now = getCurrentTimestamp()
        // A tracking event needs a reading clock for sync, but does not create chapter progress.
        val trackingTime = maxOf(now, (existing?.lastRead ?: 0L) + 1)
        val work = existing?.copy(lastRead = trackingTime, rowUpdatedAt = now, rowDeletedAt = null)
            ?: WorkEntity(
                id = workId,
                title = title?.trim()?.takeIf { it.isNotEmpty() },
                subscribed = true,
                lastRead = trackingTime,
                rowCreatedAt = now,
                rowUpdatedAt = now
            )
        workDao.upsertWork(work)
    }


    suspend fun saveWorkFromWebView(
        workInfo: WorkInfoEvent,
        workTags: WorkTagsEvent?,
        canTrack: () -> Boolean = { true }
    ) = accountData.edit(canTrack) {
        val workId = extractWorkIdFromUrl(workInfo.url) ?: return@edit
        // Validate workId
        if (workId <= 0) return@edit

        val now = getCurrentTimestamp()
        val existingWork = workDao.getWorkById(workId)

        // Parse chapter info from totalChapters (e.g., "3/10" or "1/?")
        val chapterInfo = parseChapterInfo(workInfo.totalChapters)

        val workEntity = WorkEntity(
            id = workId,
            title = workInfo.workName ?: existingWork?.title,
            author = workInfo.authorName ?: existingWork?.author,
            authorUrl = workInfo.authorUrl ?: existingWork?.authorUrl,
            summary = workInfo.summary ?: existingWork?.summary,
            language = workInfo.language ?: existingWork?.language,
            wordCount = workInfo.wordCount?.toIntOrNull() ?: existingWork?.wordCount,
            currentChapters = chapterInfo.current ?: existingWork?.currentChapters,
            totalChapters = chapterInfo.total ?: existingWork?.totalChapters,
            hits = workInfo.hits?.toIntOrNull() ?: existingWork?.hits,
            kudos = workInfo.kudos?.toIntOrNull() ?: existingWork?.kudos,
            bookmarks = workInfo.bookmarks?.toIntOrNull() ?: existingWork?.bookmarks,
            comments = workInfo.comments?.toIntOrNull() ?: existingWork?.comments,
            published = existingWork?.published, // Preserve existing, can't get from single chapter view
            lastUpdated = workInfo.workLastUpdated?.let { parseDate(it) } ?: existingWork?.lastUpdated,
            lastRefreshed = now,
            downloadPath = workInfo.downloadPath ?: existingWork?.downloadPath,
            downloadUpdatedAt = workInfo.downloadUpdatedAt ?: existingWork?.downloadUpdatedAt,
            isPrivate = workInfo.isPrivate || (existingWork?.isPrivate ?: false),
            subscribed = existingWork?.subscribed ?: true,
            subscribedUpdatedAt = existingWork?.subscribedUpdatedAt,
            favourite = existingWork?.favourite ?: false,
            favouriteUpdatedAt = existingWork?.favouriteUpdatedAt,
            lastRead = now,
            markedCompleteAt = existingWork?.markedCompleteAt,
            rowCreatedAt = existingWork?.rowCreatedAt ?: now,
            rowUpdatedAt = now,
            rowDeletedAt = null
        )

        workDao.upsertWork(workEntity)

        // Save current chapter
        // Prefer chapterId from the page content, fall back to URL extraction, 0 for single-chapter works
        val chapterId = workInfo.chapterId?.toLongOrNull()
            ?: extractChapterIdFromUrl(workInfo.url)
            ?: 0L

        val chapterNumber = parseChapterNumber(workInfo.chapterNumber) ?: 1

        val existingChapter = chapterDao.getChapterById(chapterId, workId)

        val chapterEntity = ChapterEntity(
            workId = workId,
            chapterId = chapterId,
            number = chapterNumber,
            title = workInfo.chapterName,
            dateUpdated = null, // Not available from single chapter view
            readProgress = existingChapter?.readProgress ?: 0f,
            lastReadAt = now,
            markedCompleteAt = existingChapter?.markedCompleteAt,
            rowCreatedAt = existingChapter?.rowCreatedAt ?: now,
            rowUpdatedAt = now,
            rowDeletedAt = null
        )
        chapterDao.upsertChapter(chapterEntity)

        // Save tags if provided
        workTags?.let { tags ->
            saveWorkTags(workId, tags, now)
        }
    }

    private suspend fun saveWorkTags(workId: Long, tags: WorkTagsEvent, now: Long) {
        tagDao.deleteTagsByWork(workId)
        val tagEntities = buildTagEntities(workId, tags, now)
        if (tagEntities.isNotEmpty()) {
            tagDao.upsertTags(tagEntities)
        }
    }

    private fun buildTagEntities(workId: Long, tags: WorkTagsEvent, now: Long): List<TagEntity> {
        val tagEntities = mutableListOf<TagEntity>()

        // Helper function to add tags of a specific type
        fun addTags(tagInfoList: List<com.qcksys.ao3tracker.data.model.TagInfo>, typeId: Int) {
            tagInfoList.forEach { tagInfo ->
                tagInfo.tag?.let { tag ->
                    tagEntities.add(TagEntity(
                        workId = workId,
                        tag = tag,
                        href = tagInfo.href ?: "",
                        typeId = typeId,
                        rowCreatedAt = now
                    ))
                }
            }
        }

        // Add rating (single tag)
        tags.rating?.tag?.let { tag ->
            tagEntities.add(TagEntity(
                workId = workId,
                tag = tag,
                href = tags.rating.href ?: "",
                typeId = TagType.RATING.id,
                rowCreatedAt = now
            ))
        }

        // Add list-based tags
        addTags(tags.warning, TagType.WARNING.id)
        addTags(tags.category, TagType.CATEGORY.id)
        addTags(tags.fandom, TagType.FANDOM.id)
        addTags(tags.relationship, TagType.RELATIONSHIP.id)
        addTags(tags.character, TagType.CHARACTER.id)
        addTags(tags.freeform, TagType.FREEFORM.id)

        return tagEntities
    }

    suspend fun saveChapterIndex(
        chapterIndex: WorkChapterIndexEvent,
        canTrack: () -> Boolean = { true }
    ) = accountData.edit(canTrack) {
        val workId = extractWorkIdFromUrl(chapterIndex.url) ?: return@edit
        // Validate workId
        if (workId <= 0) return@edit

        val now = getCurrentTimestamp()

        // Update work metadata from chapter index
        val existingWork = workDao.getWorkById(workId)
        if (existingWork != null) {
            val updatedWork = existingWork.copy(
                currentChapters = chapterIndex.chapters.size,
                authorUrl = chapterIndex.authorUrl ?: existingWork.authorUrl,
                lastRefreshed = now,
                rowUpdatedAt = now
            )
            workDao.upsertWork(updatedWork)
        }

        val chaptersToUpsert = mutableListOf<ChapterEntity>()

        chapterIndex.chapters.forEachIndexed { index, chapter ->
            val chapterUrl = chapter.chapterUrl ?: return@forEachIndexed
            val chapterId = extractChapterIdFromUrl("https://archiveofourown.org$chapterUrl")
                ?: return@forEachIndexed
            // Validate chapterId (must be positive for multi-chapter works)
            if (chapterId <= 0) return@forEachIndexed

            val existingChapter = chapterDao.getChapterById(chapterId, workId)
            // Update existing chapters with new metadata, or create new ones
            chaptersToUpsert.add(ChapterEntity(
                workId = workId,
                chapterId = chapterId,
                number = index + 1,
                title = chapter.chapterNumber, // "Chapter 1: Title" from navigate page
                dateUpdated = chapter.chapterDate?.let { parseDate(it) },
                readProgress = existingChapter?.readProgress,
                lastReadAt = existingChapter?.lastReadAt,
                markedCompleteAt = existingChapter?.markedCompleteAt,
                rowCreatedAt = existingChapter?.rowCreatedAt ?: now,
                rowUpdatedAt = now,
                rowDeletedAt = existingChapter?.rowDeletedAt
            ))
        }

        if (chaptersToUpsert.isNotEmpty()) {
            chapterDao.upsertChapters(chaptersToUpsert)
        }
    }

    suspend fun updateScrollProgress(
        progress: ScrollProgressEvent,
        canTrack: () -> Boolean = { true }
    ) = accountData.edit(canTrack) {
        val workId = extractWorkIdFromUrl(progress.url) ?: return@edit
        // Validate workId
        if (workId <= 0) return@edit

        // Use 0 for single-chapter works (no chapter ID in URL)
        val chapterId = progress.chapterId?.toLongOrNull()
            ?: extractChapterIdFromUrl(progress.url)
            ?: 0L
        val now = getCurrentTimestamp()

        val newProgress = progress.scrollPercentage / 100f

        // Only update if the chapter exists and new progress is higher than existing
        val existingChapter = chapterDao.getChapterById(chapterId, workId)

        if (existingChapter != null) {
            val existingProgress = existingChapter.readProgress ?: 0f
            if (newProgress > existingProgress) {
                chapterDao.updateChapterProgress(chapterId, workId, newProgress, now, now)
            }
            workDao.updateLastRead(workId, now, now)
            markWorkCaughtUp(workId, now)
        }
    }

    suspend fun deleteWork(workId: Long) = accountData.edit {
        val work = workDao.getWorkByIdIncludingDeleted(workId) ?: return@edit
        val now = getCurrentTimestamp()
        val deletedAt = maxOf(now, (work.lastRead ?: 0L) + 1)
        workDao.softDeleteWork(workId, deletedAt, now)
    }

    /**
     * Updates the subscription status for a work (for push notifications).
     */
    suspend fun updateWorkSubscription(workId: Long, subscribed: Boolean) = accountData.edit {
        val now = getCurrentTimestamp()
        workDao.updateSubscription(workId, subscribed, now, now)
    }

    /**
     * Updates the favourite status for a work.
     */
    suspend fun updateWorkFavourite(workId: Long, favourite: Boolean) = accountData.edit {
        val now = getCurrentTimestamp()
        workDao.updateFavourite(workId, favourite, now, now)
    }

    /**
     * Updates the subscription status for all works.
     */
    suspend fun updateAllWorksSubscription(subscribed: Boolean) = accountData.edit {
        val now = getCurrentTimestamp()
        workDao.updateAllSubscriptions(subscribed, now, now)
    }

    suspend fun deleteChapter(chapterId: Long, workId: Long) = accountData.edit {
        val now = getCurrentTimestamp()
        chapterDao.softDeleteChapter(chapterId, workId, now, now)
    }

    suspend fun markChapterAsRead(
        chapterId: Long,
        workId: Long,
        canTrack: () -> Boolean = { true }
    ) = accountData.edit(canTrack) {
        val now = getCurrentTimestamp()
        chapterDao.markChapterAsRead(chapterId, workId, now, now, now)
        workDao.updateLastRead(workId, now, now)
        markWorkCaughtUp(workId, now)
    }

    suspend fun markWorkAsRead(workId: Long) = accountData.edit {
        val now = getCurrentTimestamp()
        chapterDao.markAllChaptersAsRead(workId, now, now, now)
        workDao.updateLastRead(workId, now, now)
        markWorkCaughtUp(workId, now)
    }

    private suspend fun markWorkCaughtUp(workId: Long, now: Long) {
        val work = workDao.getWorkById(workId) ?: return
        if (work.markedCompleteAt != null) return

        val chapters = chapterDao.getChaptersByWorkOnce(workId)
        val currentChapters = work.currentChapters ?: chapters.size
        if (currentChapters > 0 && chapters.count { it.toDomain().isComplete } >= currentChapters) {
            workDao.markWorkComplete(workId, now, now)
        }
    }

    suspend fun markChapterAsUnread(chapterId: Long, workId: Long) = accountData.edit {
        val work = workDao.getWorkById(workId) ?: return@edit
        val chapter = chapterDao.getChapterById(chapterId, workId) ?: return@edit
        val now = maxOf(getCurrentTimestamp(), (work.lastRead ?: 0L) + 1, (chapter.lastReadAt ?: 0L) + 1)
        chapterDao.markChapterAsUnread(chapterId, workId, now)
        workDao.upsertWork(work.copy(lastRead = now, markedCompleteAt = null, rowUpdatedAt = now))
    }

    suspend fun markWorkAsUnread(workId: Long) = accountData.edit {
        val work = workDao.getWorkById(workId) ?: return@edit
        val lastChapterRead = chapterDao.getChaptersByWorkOnce(workId).maxOfOrNull { it.lastReadAt ?: 0L } ?: 0L
        val now = maxOf(getCurrentTimestamp(), (work.lastRead ?: 0L) + 1, lastChapterRead + 1)
        chapterDao.markAllChaptersAsUnread(workId, now)
        workDao.upsertWork(work.copy(lastRead = now, markedCompleteAt = null, rowUpdatedAt = now))
    }

    suspend fun getExportData(): ExportData = accountData.read {
        val works = workDao.getAllWorksOnce()
        if (works.isEmpty()) {
            return@read ExportData(
                version = 1,
                exportedAt = getCurrentTimestamp().toString(),
                works = emptyList()
            )
        }

        val workIds = works.map { it.id }
        val allChapters = chapterDao.getChaptersByWorkIds(workIds)
        val allTags = tagDao.getTagsByWorkIds(workIds)

        val chaptersByWorkId = allChapters.groupBy { it.workId }
        val tagsByWorkId = allTags.groupBy { it.workId }

        val domainWorks = works.map { work ->
            val chapters = chaptersByWorkId[work.id] ?: emptyList()
            val tags = tagsByWorkId[work.id] ?: emptyList()
            work.toDomain(chapters.map { it.toDomain() }, tags.map { it.toDomain() })
        }

        ExportData(
            version = 1,
            exportedAt = getCurrentTimestamp().toString(),
            works = domainWorks
        )
    }

    fun observeWorkCount(): Flow<Int> = accountData.observe { db ->
        db.workDao().observeWorkCount()
    }

    suspend fun getWorkCount(): Int = accountData.read { it.workDao().getWorkCount() }

    /**
     * Build badge payloads for tracked works visible on a list page.
     * Returns one entry per known work; unknown IDs are silently skipped (no badge).
     */
    suspend fun getWorkBadges(workIds: List<Long>): List<WorkBadgePayload> = accountData.read {
        if (workIds.isEmpty()) return@read emptyList()

        val payloads = mutableListOf<WorkBadgePayload>()
        // Batch-fetch chapters once for all requested work IDs.
        val chaptersByWorkId = chapterDao.getChaptersByWorkIds(workIds).groupBy { it.workId }

        for (workId in workIds) {
            val work = workDao.getWorkById(workId) ?: continue
            val chapters = chaptersByWorkId[workId] ?: emptyList()
            val domain = work.toDomain(chapters.map { it.toDomain() })
            payloads.add(buildBadgePayload(domain))
        }
        payloads
    }

    private fun buildBadgePayload(work: Work): WorkBadgePayload {
        val hasProgress = work.chapterList.any { (it.readProgress ?: 0f) > 0f }
        val currentChapters = work.currentChapters ?: work.chapterList.size
        val totalChapters = work.totalChapters
        val readChaptersCount = work.chapterList.count { it.isComplete }
        val isWorkComplete = totalChapters != null && currentChapters >= totalChapters
        val hasReadAllAvailable = readChaptersCount >= currentChapters && currentChapters > 0
        val hasNewChapters = work.markedCompleteAt != null &&
            currentChapters > readChaptersCount && readChaptersCount > 0

        val status = when {
            work.isPrivate -> "private"
            hasNewChapters -> "has-new-chapters"
            !hasProgress -> "not-started"
            hasReadAllAvailable && isWorkComplete -> "finished"
            hasReadAllAvailable -> "caught-up"
            else -> "in-progress"
        }

        return WorkBadgePayload(
            id = work.id,
            status = status,
            progressPercent = (work.readProgress * 100).toInt().coerceIn(0, 100),
            favourite = work.favourite
        )
    }

    suspend fun deleteAllLocalData() = accountData.edit {
        accountData.clearAccount()
    }

    private fun extractWorkIdFromUrl(url: String): Long? {
        val regex = Regex("/works/(\\d+)")
        return regex.find(url)?.groupValues?.get(1)?.toLongOrNull()
    }

    private fun extractChapterIdFromUrl(url: String): Long? {
        val regex = Regex("/chapters/(\\d+)")
        return regex.find(url)?.groupValues?.get(1)?.toLongOrNull()
    }

    private fun parseChapterNumber(chapterNumber: String?): Int? {
        // Format is like "chapter-123" from the element id
        if (chapterNumber == null) return null
        val regex = Regex("chapter-(\\d+)")
        return regex.find(chapterNumber)?.groupValues?.get(1)?.toIntOrNull()
    }

    private data class ChapterParseResult(
        val current: Int?,
        val total: Int?
    )

    private fun parseChapterInfo(totalChapters: String?): ChapterParseResult {
        if (totalChapters == null) return ChapterParseResult(null, null)

        val regex = Regex("(\\d+)/(\\d+|\\?)")
        val match = regex.find(totalChapters)

        return if (match != null) {
            val current = match.groupValues[1].toIntOrNull()
            val total = match.groupValues[2].toIntOrNull()
            ChapterParseResult(current = current, total = total)
        } else {
            ChapterParseResult(null, null)
        }
    }

    private fun parseDate(dateString: String): Long? {
        // Try to parse date string to timestamp
        // Format is typically "2024-01-15" or "2024-01-15 12:00" from AO3
        return try {
            // Try parsing as LocalDate first (most common format)
            val datePart = dateString.trim().split(" ").first()
            val parts = datePart.split("-")
            if (parts.size == 3) {
                val year = parts[0].toIntOrNull() ?: return null
                val month = parts[1].toIntOrNull() ?: return null
                val day = parts[2].toIntOrNull() ?: return null
                // Convert to epoch millis (start of day UTC)
                val localDate = kotlinx.datetime.LocalDate(year, month, day)
                localDate.toEpochDays().toLong() * 24L * 60L * 60L * 1000L
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    @OptIn(ExperimentalTime::class)
    private fun getCurrentTimestamp(): Long {
        return Clock.System.now().toEpochMilliseconds()
    }

    private fun WorkEntity.toDomain(
        chapters: List<Chapter> = emptyList(),
        tags: List<Tag> = emptyList()
    ): Work = Work(
        id = id,
        title = title,
        author = author,
        authorUrl = authorUrl,
        summary = summary,
        language = language,
        wordCount = wordCount,
        currentChapters = currentChapters,
        totalChapters = totalChapters,
        hits = hits,
        kudos = kudos,
        bookmarks = bookmarks,
        comments = comments,
        published = published,
        lastUpdated = lastUpdated,
        lastRefreshed = lastRefreshed,
        downloadPath = downloadPath,
        downloadUpdatedAt = downloadUpdatedAt,
        isPrivate = isPrivate,
        subscribed = subscribed,
        favourite = favourite,
        lastRead = lastRead,
        markedCompleteAt = markedCompleteAt,
        rowCreatedAt = rowCreatedAt,
        rowUpdatedAt = rowUpdatedAt,
        rowDeletedAt = rowDeletedAt,
        chapterList = chapters,
        tags = tags
    )

    private fun ChapterEntity.toDomain(): Chapter = Chapter(
        id = chapterId,
        workId = workId,
        number = number,
        title = title,
        dateUpdated = dateUpdated,
        readProgress = readProgress,
        lastReadAt = lastReadAt,
        markedCompleteAt = markedCompleteAt,
        rowCreatedAt = rowCreatedAt,
        rowUpdatedAt = rowUpdatedAt,
        rowDeletedAt = rowDeletedAt
    )

    private fun TagEntity.toDomain(): Tag = Tag(
        workId = workId,
        tag = tag,
        href = href,
        typeId = typeId,
        rowCreatedAt = rowCreatedAt
    )
}
