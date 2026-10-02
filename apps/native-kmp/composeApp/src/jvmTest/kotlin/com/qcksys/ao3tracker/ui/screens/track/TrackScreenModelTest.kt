package com.qcksys.ao3tracker.ui.screens.track

import cafe.adriel.voyager.core.annotation.InternalVoyagerApi
import cafe.adriel.voyager.core.model.ScreenModelStore
import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.createTestAccounts
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.model.FilterState
import com.qcksys.ao3tracker.data.model.ReadingStatus
import com.qcksys.ao3tracker.data.model.SyncGetResponse
import com.qcksys.ao3tracker.data.model.SyncPostRequest
import com.qcksys.ao3tracker.data.model.SyncPostResponse
import com.qcksys.ao3tracker.data.model.TagFilterMode
import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.data.sync.SyncRemote
import com.qcksys.ao3tracker.data.sync.SyncRepository
import com.qcksys.ao3tracker.data.sync.SyncCoordinator
import com.qcksys.ao3tracker.data.sync.SyncTriggers
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain

@OptIn(ExperimentalCoroutinesApi::class, InternalVoyagerApi::class)
class TrackScreenModelTest {
    @Test
    fun `work tag navigation preserves filters in every tag category`() = runTest {
        withModel { model ->
            val categories = listOf(
                TagType.RATING to FilterState::ratingFilters,
                TagType.WARNING to FilterState::warningFilters,
                TagType.CATEGORY to FilterState::categoryFilters,
                TagType.FANDOM to FilterState::fandomFilters,
                TagType.RELATIONSHIP to FilterState::relationshipFilters,
                TagType.CHARACTER to FilterState::characterFilters,
                TagType.FREEFORM to FilterState::freeformFilters
            )
            model.updateSearchQuery("story")
            model.toggleReadingStatus(ReadingStatus.IN_PROGRESS)
            for ((type, _) in categories) {
                model.toggleTagFilter(type, "Included")
                model.toggleTagFilter(type, "Excluded")
                model.toggleTagFilter(type, "Excluded")
            }

            val expected = mapOf(
                "Included" to TagFilterMode.INCLUDE,
                "Excluded" to TagFilterMode.EXCLUDE,
                "Clicked" to TagFilterMode.INCLUDE
            )
            for ((type, filters) in categories) {
                model.setTagFilter(type, "Clicked")
                assertEquals(expected, filters(model.filterState.value), type.name)
            }
            val state = model.filterState.value
            for ((type, filters) in categories) {
                assertEquals(expected, filters(state), type.name)
            }
            assertEquals("story", state.searchQuery)
            assertEquals(mapOf(ReadingStatus.IN_PROGRESS to TagFilterMode.INCLUDE), state.readingStatusFilters)
        }
    }

    @Test
    fun `successive work tag clicks add filters without duplicates`() = runTest {
        withModel { model ->
            model.setTagFilter(TagType.FANDOM, "Fandom")
            model.setTagFilter(TagType.FREEFORM, "Fluff")
            model.setTagFilter(TagType.FREEFORM, "Fluff")

            assertEquals(
                FilterState(
                    fandomFilters = mapOf("Fandom" to TagFilterMode.INCLUDE),
                    freeformFilters = mapOf("Fluff" to TagFilterMode.INCLUDE)
                ),
                model.filterState.value
            )
        }
    }

    @Test
    fun `clicking an excluded tag includes it without clearing other tags`() = runTest {
        withModel { model ->
            model.toggleFreeformTag("Fluff")
            model.toggleFreeformTag("Angst")
            model.toggleFreeformTag("Angst")
            model.setTagFilter(TagType.FREEFORM, "Angst")

            assertEquals(
                mapOf("Fluff" to TagFilterMode.INCLUDE, "Angst" to TagFilterMode.INCLUDE),
                model.filterState.value.freeformFilters
            )
        }
    }

    @Test
    fun `unknown tags leave filters unchanged`() = runTest {
        withModel { model ->
            model.setTagFilter(TagType.FANDOM, "Fandom")
            model.updateSearchQuery("story")
            val before = model.filterState.value

            model.setTagFilter(TagType.UNKNOWN, "Unknown")

            assertEquals(before, model.filterState.value)
        }
    }

    private suspend fun TestScope.withModel(block: (TrackScreenModel) -> Unit) {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val directory = Files.createTempDirectory("track-filter-test")
        val accounts = createTestAccounts(directory, StandardTestDispatcher(testScheduler))
        val holder = "track-filter-test:${directory.fileName}"
        try {
            accounts.initialize()
            val favourites = FavouriteTagRepository(accounts)
            val auth = object : SyncAuthentication {
                override val authState = MutableStateFlow<AuthState>(AuthState.Idle)
                override fun currentOwner(): String? = null
                override fun isCurrentSession(token: String, owner: String) = false
                override suspend fun invalidateSession() = Unit
            }
            val remote = object : SyncRemote {
                override suspend fun fetchSyncData(
                    token: String, lastSyncedAt: String?, workCursor: Long?, limit: Int?
                ): Result<SyncGetResponse> = error("Filter tests must not fetch remote state")

                override suspend fun sendSyncData(
                    token: String, request: SyncPostRequest
                ): Result<SyncPostResponse> = error("Filter tests must not send remote state")
            }
            val sync = SyncRepository(remote, auth, favourites, SavedSearchRepository(accounts), accounts)
            val coordinator = SyncCoordinator(sync, auth, accounts, signOut = { error("Filter tests must not sign out") }, scope = backgroundScope)
            val model = ScreenModelStore.getOrPut(holder, null) {
                TrackScreenModel(Ao3Repository(accounts), coordinator, favourites, SyncTriggers(coordinator))
            }
            block(model)
        } finally {
            ScreenModelStore.onDisposeNavigator(holder)
            runCurrent()
            accounts.close()
            Dispatchers.resetMain()
            Files.walk(directory).use { paths ->
                paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
            }
        }
    }
}
