package com.qcksys.ao3tracker.data.repository

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import com.qcksys.ao3tracker.data.database.SearchCheckEntity
import com.qcksys.ao3tracker.data.model.SearchChanges
import com.qcksys.ao3tracker.data.model.SearchCheckMessage
import com.qcksys.ao3tracker.data.model.SearchWork
import com.qcksys.ao3tracker.util.JsonConfig
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import kotlin.time.Clock

data class SearchCheckRequest(
    val search: SavedSearchEntity,
    val owner: String,
    val generation: Long,
    val previous: SearchCheckEntity?,
    val startedAt: Long = Clock.System.now().toEpochMilliseconds()
)

class SearchCheckRepository(private val accounts: AccountDataStore) {
    fun observeChecks() = accounts.observe { it.searchCheckDao().observeAll() }

    suspend fun liveSearches() = accounts.read { db -> db.savedSearchDao().getAll().filterNot { it.deleted } }

    suspend fun capture(id: String): SearchCheckRequest = accounts.read { db ->
        val search = requireNotNull(db.savedSearchDao().getOne(id)) { "Search no longer exists" }
        require(!search.deleted && isTrustedAo3Url(search.url)) { "This search cannot be checked" }
        SearchCheckRequest(search, requireNotNull(accounts.active.value).owner, accounts.generation, db.searchCheckDao().getOne(id))
    }

    suspend fun markViewed(id: String) {
        val request = capture(id)
        accounts.forAccount(request.owner, { accounts.generation == request.generation }) {
            val previous = accounts.database.searchCheckDao().getOne(id) ?: return@forAccount
            accounts.database.searchCheckDao().upsert(previous.copy(
                lastViewedAt = maxOf(request.startedAt, (previous.lastViewedAt ?: 0) + 1),
                changesJson = "{}", newWorks = 0, updatedWorks = 0
            ))
        }
    }

    suspend fun record(request: SearchCheckRequest, result: SearchCheckMessage) {
        require(result.type == "searchCheckResult" && result.context.isNotEmpty())
        val observedWorks = requireNotNull(result.works)
        require(observedWorks.all { it.id > 0 })
        require(!result.baseline || result.complete)
        require(!result.fullScan || result.complete)
        require(result.complete == (result.nextUrl == null))
        require(result.nextUrl == null || isTrustedAo3Url(result.nextUrl))
        accounts.forAccount(request.owner, { accounts.generation == request.generation }) {
            val db = accounts.database
            val current = db.savedSearchDao().getOne(request.search.id)
            val stored = db.searchCheckDao().getOne(request.search.id)
            if (current == null || current.deleted || current.url != request.search.url ||
                stored?.lastViewedAt != request.previous?.lastViewedAt) {
                throw CancellationException("Search changed during the check")
            }
            val previous = stored?.takeIf { it.context == result.context && !result.baseline }
            val oldWorks = previous?.let { JsonConfig.json.decodeFromString<List<SearchWork>>(it.worksJson) }
                ?.associateBy { it.id }.orEmpty()
            val works = observedWorks.distinctBy { it.id }
            val pending = previous?.let { JsonConfig.json.decodeFromString<SearchChanges>(it.changesJson) }
                ?: SearchChanges()
            val newIds = pending.newIds.toMutableSet()
            val updatedIds = pending.updatedIds.toMutableSet()
            // The first full scan establishes coverage of older works, rather than counting them as new.
            if (previous != null && (!result.fullScan || previous.fullSnapshot)) {
                for (work in works) {
                    val old = oldWorks[work.id]
                    if (old == null) newIds.add(work.id)
                    else if (old != work && work.id !in newIds) updatedIds.add(work.id)
                }
            }
            val snapshot = if (result.fullScan) works else (oldWorks + works.associateBy { it.id }).values.toList()
            val scanStartedAt = if (result.fullScan) request.startedAt else previous?.scanStartedAt ?: request.startedAt
            db.searchCheckDao().upsert(SearchCheckEntity(
                searchId = current.id,
                url = current.url,
                context = result.context,
                worksJson = JsonConfig.json.encodeToString(snapshot),
                checkedAt = if (result.complete) scanStartedAt else previous?.checkedAt ?: request.startedAt,
                previousCheckedAt = previous?.checkedAt,
                newWorks = newIds.size,
                updatedWorks = updatedIds.size,
                lastViewedAt = previous?.lastViewedAt ?: request.startedAt,
                changesJson = JsonConfig.json.encodeToString(SearchChanges(newIds, updatedIds)),
                attemptedAt = Clock.System.now().toEpochMilliseconds(),
                partial = !result.complete,
                fullSnapshot = result.fullScan || previous?.fullSnapshot == true,
                resumeUrl = result.nextUrl,
                scanStartedAt = if (result.complete) null else scanStartedAt
            ))
        }
    }
}
