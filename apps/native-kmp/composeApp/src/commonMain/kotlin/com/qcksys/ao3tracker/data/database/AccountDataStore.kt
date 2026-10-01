package com.qcksys.ao3tracker.data.database

import androidx.room.immediateTransaction
import androidx.room.useWriterConnection
import com.qcksys.ao3tracker.util.JsonConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlin.time.Clock
import kotlin.uuid.Uuid

class AccountDataStore(
    private val legacyDatabase: Ao3Database,
    private val openDatabase: (String) -> Ao3Database
) {
    private val mutex = Mutex()
    private val databases = mutableMapOf<String, Ao3Database>()
    private val currentDatabase = MutableStateFlow<Ao3Database?>(null)
    val database: Ao3Database get() = requireNotNull(currentDatabase.value) { "Account storage is not initialized" }
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

    suspend fun initialize(): ActiveAccountEntity = mutex.withLock { initializeLocked() }

    private suspend fun initializeLocked(): ActiveAccountEntity {
        _active.value?.let { return it }
        val selected = legacyDatabase.accountDao().getSelectedDatabase()
        val db = if (selected == null) legacyDatabase else databaseFor(selected.owner)
        val state = db.accountDao().getActive() ?: ActiveAccountEntity(owner = GUEST)
        currentDatabase.value = db
        _active.value = state
        return state
    }

    suspend fun activate(owner: String, claimLegacy: Boolean = false) = mutex.withLock {
        // Once assigned, the legacy rows retain this owner for all migration retries.
        if (legacyDatabase.accountDao().getActive() == null) {
            legacyDatabase.accountDao().setActive(ActiveAccountEntity(owner = if (claimLegacy) owner else GUEST))
        }
        val nextDatabase = databaseFor(owner)
        val next = requireNotNull(nextDatabase.accountDao().getActive())
        legacyDatabase.accountDao().selectDatabase(owner)
        generationState.value++
        currentDatabase.value = nextDatabase
        _active.value = next
    }

    private suspend fun databaseFor(owner: String): Ao3Database {
        val dao = legacyDatabase.accountDao()
        val entry = dao.getDatabase(owner) ?: AccountDatabaseEntity(
            owner = owner,
            fileName = "ao3tracker-${Uuid.random()}.db"
        ).also { dao.saveDatabase(it) }
        val db = databases.getOrPut(owner) { openDatabase(entry.fileName) }
        if (db.accountDao().getActive() == null) {
            val legacy = dao.getActive()
            val archive = if (legacy?.owner == owner) null else dao.getArchive(owner)
            val snapshot = when {
                legacy?.owner == owner -> snapshot(legacyDatabase)
                archive != null -> JsonConfig.json.decodeFromString(AccountSnapshot.serializer(), archive.data)
                else -> null
            }
            transaction(db) {
                if (snapshot != null) restore(db, snapshot)
                db.accountDao().setActive(ActiveAccountEntity(
                    owner = owner,
                    remoteCursor = if (legacy?.owner == owner) legacy.remoteCursor else archive?.remoteCursor,
                    localCursor = if (legacy?.owner == owner) legacy.localCursor else archive?.localCursor
                ))
            }
        }
        return db
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    fun <T> observe(query: (Ao3Database) -> Flow<T>): Flow<T> =
        currentDatabase.filterNotNull().flatMapLatest(query)

    suspend fun <T> read(block: suspend (Ao3Database) -> T): T = mutex.withLock {
        initializeLocked()
        block(database)
    }

    suspend fun <T> edit(isCurrentOperation: () -> Boolean = { true }, block: suspend () -> T): T {
        val expectedGeneration = generation
        return mutex.withLock {
            if (generation != expectedGeneration) throw CancellationException("Account changed")
            initializeLocked()
            transaction(database) {
                if (!isCurrentOperation()) throw CancellationException("Operation cancelled")
                block().also {
                    if (!isCurrentOperation()) throw CancellationException("Operation cancelled")
                }
            }.also {
                localRevision++
                _active.value = database.accountDao().getActive() ?: _active.value
            }
        }
    }

    suspend fun <T> forAccount(owner: String, isCurrentSession: () -> Boolean, block: suspend () -> T): T = mutex.withLock {
        if (_active.value?.owner != owner || !isCurrentSession()) throw CancellationException("Account changed")
        transaction(database) {
            block().also {
                if (!isCurrentSession()) throw CancellationException("Account changed")
            }
        }.also { _active.value = database.accountDao().getActive() }
    }

    private suspend fun <T> transaction(db: Ao3Database, block: suspend () -> T): T = db.useWriterConnection { connection ->
        connection.immediateTransaction { block() }
    }

    suspend fun saveSyncCursors(remote: String, local: Long) {
        val state = requireNotNull(_active.value).copy(remoteCursor = remote, localCursor = local)
        database.accountDao().setActive(state)
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
    }

    suspend fun importGuest(owner: String, isCurrentSession: () -> Boolean): GuestImportResult = mutex.withLock {
        require(owner != GUEST) { "Sign in to import guest data" }
        if (_active.value?.owner != owner || !isCurrentSession()) throw CancellationException("Account changed")
        val guest = snapshot(databaseFor(GUEST))
        val result = transaction(database) {
            val now = maxOf(Clock.System.now().toEpochMilliseconds(), (_active.value?.localCursor ?: 0) + 1)
            val workIds = mutableSetOf<Long>()
            for (work in guest.works) {
                if (work.rowDeletedAt != null || database.workDao().getWorkByIdIncludingDeleted(work.id) != null) continue
                database.workDao().upsertWork(work.copy(rowUpdatedAt = now))
                workIds.add(work.id)
            }
            val chapters = guest.chapters.filter { it.workId in workIds && it.rowDeletedAt == null }
            database.chapterDao().upsertChapters(chapters.map { it.copy(rowUpdatedAt = now) })
            database.tagDao().upsertTags(guest.tags.filter { it.workId in workIds })
            val favourites = guest.favourites.filter {
                it.favourited && database.favouriteTagDao().getOne(it.tagType, it.tag) == null
            }
            database.favouriteTagDao().upsertAll(favourites.map { it.copy(pendingSync = true) })
            val searches = guest.searches.filter { !it.deleted && database.savedSearchDao().getOne(it.id) == null }
            database.savedSearchDao().upsertAll(searches.map { it.copy(pendingSync = true) })
            if (!isCurrentSession()) throw CancellationException("Account changed")
            GuestImportResult(workIds.size, chapters.size, favourites.size, searches.size)
        }
        localRevision++
        result
    }

    fun close() {
        databases.values.forEach { it.close() }
        legacyDatabase.close()
    }

    private suspend fun snapshot(db: Ao3Database) = AccountSnapshot(
        works = db.workDao().getAllWorksIncludingDeletedOnce(),
        chapters = db.chapterDao().getAllChaptersIncludingDeletedOnce(),
        tags = db.tagDao().getAll(),
        favourites = db.favouriteTagDao().getAll(),
        searches = db.savedSearchDao().getAll()
    )

    private suspend fun restore(db: Ao3Database, snapshot: AccountSnapshot) {
        snapshot.works.forEach { db.workDao().upsertWork(it) }
        db.chapterDao().upsertChapters(snapshot.chapters)
        db.tagDao().upsertTags(snapshot.tags)
        db.favouriteTagDao().upsertAll(snapshot.favourites)
        db.savedSearchDao().upsertAll(snapshot.searches)
    }
}

data class GuestImportResult(val works: Int, val chapters: Int, val favourites: Int, val searches: Int) {
    val isEmpty: Boolean get() = works == 0 && chapters == 0 && favourites == 0 && searches == 0
}

@Serializable
internal data class AccountSnapshot(
    val works: List<WorkEntity>,
    val chapters: List<ChapterEntity>,
    val tags: List<TagEntity>,
    val favourites: List<FavouriteTagEntity>,
    val searches: List<SavedSearchEntity>
)
