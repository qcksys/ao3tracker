package com.qcksys.ao3tracker.data.repository

import com.qcksys.ao3tracker.data.database.FavouriteTagDao
import com.qcksys.ao3tracker.data.database.FavouriteTagEntity
import com.qcksys.ao3tracker.data.model.TagType
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest

/**
 * Tests the LWW + tombstone semantics of [FavouriteTagRepository] without
 * needing a real Room database — a Map-backed fake DAO is enough.
 */
class FavouriteTagRepositoryTest {

    @Test
    fun `applyRemote inserts unseen rows`() = runTest {
        val (repo, dao) = build()

        repo.applyRemote(
            listOf(
                RemoteFavouriteTag(
                    tagType = 4,
                    tag = "Fluff",
                    favourited = true,
                    updatedAt = 1_000L
                )
            )
        )

        val row = dao.getOne(4, "Fluff")
        assertEquals(true, row?.favourited)
        assertEquals(1_000L, row?.updatedAt)
        assertEquals(false, row?.pendingSync)
    }

    @Test
    fun `applyRemote ignores stale incoming rows`() = runTest {
        val (repo, dao) = build()
        dao.upsert(FavouriteTagEntity(4, "Fluff", true, 2_000L, pendingSync = false))

        repo.applyRemote(
            listOf(RemoteFavouriteTag(4, "Fluff", false, 1_000L))
        )

        val row = dao.getOne(4, "Fluff")
        assertEquals(true, row?.favourited)
        assertEquals(2_000L, row?.updatedAt)
    }

    @Test
    fun `applyRemote ignores ties (server already won by definition)`() = runTest {
        val (repo, dao) = build()
        dao.upsert(FavouriteTagEntity(4, "Fluff", true, 1_000L, pendingSync = false))

        repo.applyRemote(
            listOf(RemoteFavouriteTag(4, "Fluff", false, 1_000L))
        )

        assertEquals(true, dao.getOne(4, "Fluff")?.favourited)
    }

    @Test
    fun `applyRemote accepts a tombstone with newer timestamp`() = runTest {
        val (repo, dao) = build()
        dao.upsert(FavouriteTagEntity(4, "Fluff", true, 1_000L, pendingSync = false))

        repo.applyRemote(
            listOf(RemoteFavouriteTag(4, "Fluff", false, 2_000L))
        )

        val row = dao.getOne(4, "Fluff")
        assertEquals(false, row?.favourited)
        assertEquals(2_000L, row?.updatedAt)
    }

    @Test
    fun `toggleFavourite writes a row with pendingSync=true`() = runTest {
        val (repo, dao) = build()

        val nowFav = repo.toggleFavourite(TagType.FANDOM, "Marvel")
        assertTrue(nowFav)
        val first = dao.getOne(TagType.FANDOM.id, "Marvel")
        assertEquals(true, first?.favourited)
        assertEquals(true, first?.pendingSync)

        val nowUnfav = repo.toggleFavourite(TagType.FANDOM, "Marvel")
        assertFalse(nowUnfav)
        val second = dao.getOne(TagType.FANDOM.id, "Marvel")
        // Tombstone in place — row stays, favourited flips, pendingSync re-armed.
        assertEquals(false, second?.favourited)
        assertEquals(true, second?.pendingSync)
        assertTrue((second?.updatedAt ?: 0L) >= (first?.updatedAt ?: 0L))
    }

    @Test
    fun `observeFavourites emits only live rows in tab-separated key format`() =
        runTest {
            val (repo, dao) = build()
            dao.upsert(FavouriteTagEntity(4, "Fluff", true, 1_000L, false))
            dao.upsert(FavouriteTagEntity(4, "Angst", false, 1_000L, false)) // tombstone
            dao.upsert(FavouriteTagEntity(7, "Slow Burn", true, 1_000L, false))

            val emitted = repo.observeFavourites().first()
            assertContentEquals(
                listOf("4\tFluff", "7\tSlow Burn").sorted(),
                emitted.toList().sorted()
            )
        }

    // --- helpers ----------------------------------------------------------------

    private fun build(): Pair<FavouriteTagRepository, FakeFavouriteTagDao> {
        val dao = FakeFavouriteTagDao()
        return FavouriteTagRepository(dao) to dao
    }
}

private class FakeFavouriteTagDao : FavouriteTagDao {
    private val rows = MutableStateFlow<Map<Pair<Int, String>, FavouriteTagEntity>>(
        emptyMap()
    )

    override fun observeLive(): Flow<List<FavouriteTagEntity>> =
        rows.map { snapshot -> snapshot.values.filter { it.favourited } }

    override suspend fun getOne(tagType: Int, tag: String): FavouriteTagEntity? =
        rows.value[tagType to tag]

    override suspend fun getPendingSync(): List<FavouriteTagEntity> =
        rows.value.values.filter { it.pendingSync }

    override suspend fun getAll(): List<FavouriteTagEntity> = rows.value.values.toList()

    override suspend fun count(): Int = rows.value.size

    override suspend fun upsert(entity: FavouriteTagEntity) {
        rows.value = rows.value + ((entity.tagType to entity.tag) to entity)
    }

    override suspend fun upsertAll(entities: List<FavouriteTagEntity>) {
        rows.value = rows.value + entities.associateBy { it.tagType to it.tag }
    }

    override suspend fun clearPending(tagType: Int, tag: String) {
        val key = tagType to tag
        val existing = rows.value[key] ?: return
        rows.value = rows.value + (key to existing.copy(pendingSync = false))
    }

    override suspend fun deleteAll() {
        rows.value = emptyMap()
    }
}
