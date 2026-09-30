package com.qcksys.ao3tracker.data.database

import androidx.room.immediateTransaction
import androidx.room.useWriterConnection
import com.qcksys.ao3tracker.util.JsonConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable

class AccountDataStore(private val database: Ao3Database) {
    private val mutex = Mutex()
    private val _active = MutableStateFlow<ActiveAccountEntity?>(null)
    val active = _active.asStateFlow()
    private val generationState = MutableStateFlow(0L)
    val generation: Long get() = generationState.value
    var localRevision = 0L
        private set

    companion object {
        const val GUEST = "guest"
        fun owner(environment: String, userId: String): String = "$environment:$userId"
    }

    suspend fun initialize(): ActiveAccountEntity = mutex.withLock {
        val state = database.accountDao().getActive() ?: ActiveAccountEntity(owner = GUEST)
        _active.value = state
        state
    }

    suspend fun activate(owner: String, claimLegacy: Boolean = false) = mutex.withLock {
        database.useWriterConnection { connection ->
            connection.immediateTransaction {
                val persisted = database.accountDao().getActive()
                val current = persisted ?: ActiveAccountEntity(owner = GUEST)
                if (current.owner != owner && !(claimLegacy && persisted == null)) {
                    val snapshot = snapshot()
                    database.accountDao().archive(AccountArchiveEntity(
                        owner = current.owner,
                        data = JsonConfig.json.encodeToString(AccountSnapshot.serializer(), snapshot),
                        remoteCursor = current.remoteCursor,
                        localCursor = current.localCursor
                    ))
                    clearActiveData()
                    val archive = database.accountDao().getArchive(owner)
                    if (archive != null) restore(JsonConfig.json.decodeFromString(AccountSnapshot.serializer(), archive.data))
                    val next = ActiveAccountEntity(owner = owner, remoteCursor = archive?.remoteCursor, localCursor = archive?.localCursor)
                    database.accountDao().setActive(next)
                    _active.value = next
                } else {
                    val next = current.copy(owner = owner)
                    database.accountDao().setActive(next)
                    _active.value = next
                }
            }
        }
        generationState.value++
    }

    suspend fun <T> edit(isCurrentOperation: () -> Boolean = { true }, block: suspend () -> T): T {
        val expectedGeneration = generation
        return mutex.withLock {
            if (generation != expectedGeneration) throw CancellationException("Account changed")
            transaction {
                if (!isCurrentOperation()) throw CancellationException("Operation cancelled")
                block().also {
                    if (!isCurrentOperation()) throw CancellationException("Operation cancelled")
                }
            }.also { localRevision++ }
        }
    }

    suspend fun <T> forAccount(owner: String, isCurrentSession: () -> Boolean, block: suspend () -> T): T = mutex.withLock {
        if (_active.value?.owner != owner || !isCurrentSession()) throw CancellationException("Account changed")
        transaction(block)
    }

    private suspend fun <T> transaction(block: suspend () -> T): T = database.useWriterConnection { connection ->
        connection.immediateTransaction { block() }
    }

    suspend fun saveSyncCursors(remote: String, local: Long) {
        val state = requireNotNull(_active.value).copy(remoteCursor = remote, localCursor = local)
        database.accountDao().setActive(state)
        _active.value = state
    }

    suspend fun clearActiveData() {
        database.tagDao().deleteAllTags()
        database.chapterDao().deleteAllChapters()
        database.workDao().deleteAllWorks()
        database.favouriteTagDao().deleteAll()
        database.savedSearchDao().deleteAll()
    }

    suspend fun clearAccount() {
        clearActiveData()
        val state = requireNotNull(_active.value).copy(remoteCursor = null, localCursor = null)
        database.accountDao().setActive(state)
        _active.value = state
    }

    private suspend fun snapshot() = AccountSnapshot(
        works = database.workDao().getAllWorksIncludingDeletedOnce(),
        chapters = database.chapterDao().getAllChaptersIncludingDeletedOnce(),
        tags = database.tagDao().getAll(),
        favourites = database.favouriteTagDao().getAll(),
        searches = database.savedSearchDao().getAll()
    )

    private suspend fun restore(snapshot: AccountSnapshot) {
        snapshot.works.forEach { database.workDao().upsertWork(it) }
        database.chapterDao().upsertChapters(snapshot.chapters)
        database.tagDao().upsertTags(snapshot.tags)
        database.favouriteTagDao().upsertAll(snapshot.favourites)
        database.savedSearchDao().upsertAll(snapshot.searches)
    }
}

@Serializable
private data class AccountSnapshot(
    val works: List<WorkEntity>,
    val chapters: List<ChapterEntity>,
    val tags: List<TagEntity>,
    val favourites: List<FavouriteTagEntity>,
    val searches: List<SavedSearchEntity>
)
