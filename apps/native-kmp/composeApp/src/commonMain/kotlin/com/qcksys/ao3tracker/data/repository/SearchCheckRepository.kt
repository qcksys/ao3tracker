package com.qcksys.ao3tracker.data.repository

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import com.qcksys.ao3tracker.data.database.SearchCheckEntity
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
    val previous: SearchCheckEntity?
)

class SearchCheckRepository(private val accounts: AccountDataStore) {
    fun observeChecks() = accounts.observe { it.searchCheckDao().observeAll() }

    suspend fun liveSearches() = accounts.read { db -> db.savedSearchDao().getAll().filterNot { it.deleted } }

    suspend fun capture(id: String): SearchCheckRequest = accounts.read { db ->
        val search = requireNotNull(db.savedSearchDao().getOne(id)) { "Search no longer exists" }
        require(!search.deleted && isTrustedAo3Url(search.url)) { "This search cannot be checked" }
        SearchCheckRequest(search, requireNotNull(accounts.active.value).owner, accounts.generation, db.searchCheckDao().getOne(id))
    }

    suspend fun record(request: SearchCheckRequest, result: SearchCheckMessage) {
        require(result.type == "searchCheckResult" && result.context.isNotEmpty())
        val observedWorks = requireNotNull(result.works)
        require(observedWorks.all { it.id > 0 })
        accounts.forAccount(request.owner, { accounts.generation == request.generation }) {
            val db = accounts.database
            val current = db.savedSearchDao().getOne(request.search.id)
            if (current == null || current.deleted || current.url != request.search.url) {
                throw CancellationException("Search changed during the check")
            }
            val previous = db.searchCheckDao().getOne(current.id)?.takeIf { it.context == result.context }
            val oldWorks = previous?.let { JsonConfig.json.decodeFromString<List<SearchWork>>(it.worksJson) }
                ?.associateBy { it.id }
            val works = observedWorks.distinctBy { it.id }
            db.searchCheckDao().upsert(SearchCheckEntity(
                searchId = current.id,
                url = current.url,
                context = result.context,
                worksJson = JsonConfig.json.encodeToString(works),
                checkedAt = Clock.System.now().toEpochMilliseconds(),
                previousCheckedAt = previous?.checkedAt,
                newWorks = if (oldWorks == null) 0 else works.count { it.id !in oldWorks },
                updatedWorks = if (oldWorks == null) 0 else works.count { oldWorks[it.id]?.let { old -> old != it } == true }
            ))
        }
    }
}
