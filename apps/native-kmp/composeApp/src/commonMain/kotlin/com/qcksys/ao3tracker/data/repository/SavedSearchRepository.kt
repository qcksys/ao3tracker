package com.qcksys.ao3tracker.data.repository

import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import com.qcksys.ao3tracker.data.database.AccountDataStore
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid
import kotlinx.coroutines.flow.Flow

/**
 * Repository for per-user saved searches (named AO3 filter/search URLs).
 *
 * Backed by Room (`SavedSearchEntity`) and synced across devices via
 * `/api/track/sync`'s `savedSearches` block. Rows are keyed by a
 * client-generated uuid so renames/deletes converge without colliding.
 */
@OptIn(ExperimentalTime::class)
class SavedSearchRepository(
    private val accountData: AccountDataStore
) {
    private val dao get() = accountData.database.savedSearchDao()
    companion object {
        // Match the server/wire caps (savedSearchItemSchema in
        // packages/ao3-core/src/schemas/sync.ts and the DB varchar widths) so a
        // row can never be rejected by the sync POST — an unsyncable row rides
        // the same batch as works/chapters and would wedge the whole sync.
        private const val MAX_NAME_LENGTH = 191
        private const val MAX_URL_LENGTH = 8192
    }

    /** Observe the live (non-deleted) saved searches, newest edit first. */
    fun observeLive(): Flow<List<SavedSearchEntity>> = accountData.observe { it.savedSearchDao().observeLive() }

    /**
     * Save a new named search. Generates a stable uuid id so the row can be
     * renamed without changing identity. Name/url are clamped to the server
     * caps. Returns the stored row.
     */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun save(name: String, url: String): SavedSearchEntity = edit {
        val now = Clock.System.now().toEpochMilliseconds()
        val entity = SavedSearchEntity(
            id = Uuid.random().toString(),
            name = name.trim().take(MAX_NAME_LENGTH),
            url = url.take(MAX_URL_LENGTH),
            deleted = false,
            updatedAt = now,
            pendingSync = true
        )
        dao.upsert(entity)
        entity
    }

    /** Rename a saved search in place, bumping `updatedAt` so the change syncs. */
    suspend fun rename(id: String, name: String) = edit {
        val current = dao.getOne(id) ?: return@edit
        val now = Clock.System.now().toEpochMilliseconds()
        dao.upsert(
            current.copy(
                name = name.trim().take(MAX_NAME_LENGTH),
                updatedAt = now,
                pendingSync = true
            )
        )
    }

    /**
     * Delete a saved search. Tombstones the row (deleted = true) rather than
     * removing it, so the deletion syncs to other devices via LWW.
     */
    suspend fun delete(id: String) = edit {
        val current = dao.getOne(id) ?: return@edit
        val now = Clock.System.now().toEpochMilliseconds()
        dao.upsert(current.copy(deleted = true, updatedAt = now, pendingSync = true))
    }

    /** Rows with local changes that haven't been pushed to the server yet. */
    suspend fun getPendingSync(): List<SavedSearchEntity> = dao.getPendingSync()

    /** Mark a row as synced (called after the server accepts a push). */
    suspend fun markSynced(entity: SavedSearchEntity) = dao.clearPending(
        entity.id, entity.updatedAt, entity.name, entity.url, entity.deleted
    )

    /**
     * Apply rows received from the server, LWW-merging against local state.
     * For each incoming row, the row is written only if its `updatedAt` is
     * strictly greater than the local `updatedAt` (server wins on tie).
     */
    suspend fun applyRemote(items: List<RemoteSavedSearch>) {
        if (items.isEmpty()) return

        val toUpsert = mutableListOf<SavedSearchEntity>()
        for (item in items) {
            val local = dao.getOne(item.id)
            if (local != null && local.updatedAt > item.updatedAt) continue
            toUpsert.add(
                SavedSearchEntity(
                    id = item.id,
                    name = item.name,
                    url = item.url,
                    deleted = item.deleted,
                    updatedAt = item.updatedAt,
                    pendingSync = false
                )
            )
        }
        if (toUpsert.isNotEmpty()) dao.upsertAll(toUpsert)
    }

    private suspend fun <T> edit(block: suspend () -> T): T =
        accountData.edit(block = block)
}

/** Wire-format row from the server (decoded from the sync DTO). */
data class RemoteSavedSearch(
    val id: String,
    val name: String,
    val url: String,
    val deleted: Boolean,
    /** Epoch millis */
    val updatedAt: Long
)
