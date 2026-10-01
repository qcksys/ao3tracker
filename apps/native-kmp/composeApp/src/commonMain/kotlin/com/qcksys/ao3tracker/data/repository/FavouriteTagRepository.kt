package com.qcksys.ao3tracker.data.repository

import com.qcksys.ao3tracker.data.database.FavouriteTagDao
import com.qcksys.ao3tracker.data.database.FavouriteTagEntity
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.model.TagType
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Repository for per-user favourite tag filters.
 *
 * Backed by Room (`FavouriteTagEntity`) and synced across devices via
 * `/api/track/sync`'s `favouriteTags` block. Tag keys exposed to the UI use
 * the format `"${tagType.id}\t$tag"` (tab-separated).
 */
class FavouriteTagRepository(
    private val fallbackDao: FavouriteTagDao? = null,
    private val accountData: AccountDataStore? = null
) {
    constructor(accountData: AccountDataStore) : this(accountData = accountData, fallbackDao = null)

    private val dao get() = accountData?.database?.favouriteTagDao() ?: requireNotNull(fallbackDao)
    /** Observe the currently-favourited set as `"${tagType.id}\t$tag"` strings. */
    fun observeFavourites(): Flow<Set<String>> {
        val rows = accountData?.observe { it.favouriteTagDao().observeLive() } ?: dao.observeLive()
        return rows.map { rows ->
            rows.mapTo(mutableSetOf()) { entityKey(it.tagType, it.tag) }
        }
    }

    /** Whether a tag is currently favourited. */
    suspend fun isFavourite(tagType: TagType, tag: String): Boolean {
        return dao.getOne(tagType.id, tag)?.favourited == true
    }

    /**
     * Toggle the favourite state of (tagType, tag). Always writes a row (tombstone
     * in place when unfavouriting) so the change can be pushed to the server.
     * Returns true if the tag is now favourited, false otherwise.
     */
    @OptIn(ExperimentalTime::class)
    suspend fun toggleFavourite(tagType: TagType, tag: String): Boolean = edit {
        val now = Clock.System.now().toEpochMilliseconds()
        val current = dao.getOne(tagType.id, tag)
        val nextFavourited = current?.favourited != true
        dao.upsert(
            FavouriteTagEntity(
                tagType = tagType.id,
                tag = tag,
                favourited = nextFavourited,
                updatedAt = now,
                pendingSync = true
            )
        )
        nextFavourited
    }

    /** Rows with local changes that haven't been pushed to the server yet. */
    suspend fun getPendingSync(): List<FavouriteTagEntity> {
        return dao.getPendingSync()
    }

    /** Mark a row as synced (called after the server accepts a push). */
    suspend fun markSynced(entity: FavouriteTagEntity) {
        dao.clearPending(entity.tagType, entity.tag, entity.updatedAt, entity.favourited)
    }

    /**
     * Apply rows received from the server, LWW-merging against local state.
     * For each incoming row, the row is written only if its `updatedAt` is
     * strictly greater than the local `updatedAt` (server wins on tie since
     * the client wouldn't have asked for it if it had newer data).
     */
    suspend fun applyRemote(items: List<RemoteFavouriteTag>) {
        if (items.isEmpty()) return

        val toUpsert = mutableListOf<FavouriteTagEntity>()
        for (item in items) {
            val local = dao.getOne(item.tagType, item.tag)
            if (local != null && local.updatedAt > item.updatedAt) continue
            toUpsert.add(
                FavouriteTagEntity(
                    tagType = item.tagType,
                    tag = item.tag,
                    favourited = item.favourited,
                    updatedAt = item.updatedAt,
                    pendingSync = false
                )
            )
        }
        if (toUpsert.isNotEmpty()) dao.upsertAll(toUpsert)
    }

    private fun entityKey(tagType: Int, tag: String): String = "$tagType\t$tag"

    private suspend fun <T> edit(block: suspend () -> T): T =
        accountData?.edit(block = block) ?: block()
}

/** Wire-format row from the server (decoded from the sync DTO). */
data class RemoteFavouriteTag(
    val tagType: Int,
    val tag: String,
    val favourited: Boolean,
    /** Epoch millis */
    val updatedAt: Long
)
