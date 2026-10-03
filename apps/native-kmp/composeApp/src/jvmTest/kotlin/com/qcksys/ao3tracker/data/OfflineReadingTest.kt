package com.qcksys.ao3tracker.data

import cafe.adriel.voyager.core.annotation.InternalVoyagerApi
import cafe.adriel.voyager.core.model.ScreenModelStore
import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.database.*
import com.qcksys.ao3tracker.data.model.*
import com.qcksys.ao3tracker.data.offline.*
import com.qcksys.ao3tracker.data.repository.*
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.sync.*
import com.qcksys.ao3tracker.ui.navigation.ReadNavigation
import com.qcksys.ao3tracker.ui.screens.read.ReadScreenModel
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import kotlin.test.*

@OptIn(ExperimentalCoroutinesApi::class, InternalVoyagerApi::class)
class OfflineReadingTest {
    @Test
    fun `confirmed AO3 logout and tracker replacement clear live history and replace the reader session`() = runTest {
        for (trackerChange in listOf(false, true)) fixture(connected = true) { f ->
            f.model.navigateToReadingPosition(ReadNavigation(url(11), null))
            f.model.navigateToReadingPosition(ReadNavigation(url(22), null))
            assertTrue(f.model.canGoBack.value)
            val session = f.model.liveReaderSession.value
            if (trackerChange) f.accounts.activate("production:other") else f.offline.store.observeIdentity("guest")
            runCurrent()
            assertTrue(f.model.liveReaderSession.value > session)
            assertEquals("https://archiveofourown.org", f.model.currentUrl.value)
            assertFalse(f.model.canGoBack.value)
            assertFalse(f.model.canGoForward.value)
            assertFalse(f.model.goBack())
        }
    }

    @Test
    fun `whole work URLs keep the current chapter until the reader chooses chapter view or online`() = runTest {
        for (connected in listOf(false, true)) fixture(connected) { f ->
            f.save(11)
            f.model.navigateToReadingPosition(ReadNavigation(url(11), .42f))
            val first = assertNotNull(f.model.savedChapter.value)
            val whole = "https://archiveofourown.org/works/1?view_full_work=true#chapter-2"
            f.model.navigateToReadingPosition(ReadNavigation(whole, null))
            assertSame(first, f.model.savedChapter.value)
            assertEquals(.42f, f.model.scrollProgress.value)
            assertEquals(whole, f.model.unavailableDestination.value)
            assertTrue(f.accounts.database.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
            assertFalse(f.model.canGoBack.value)
            f.model.tryUnavailableOnline()
            runCurrent()
            assertNull(f.model.savedChapter.value)
            assertEquals(whole, f.model.currentUrl.value)
            assertTrue(first.document.isActive())
        }
    }

    @Test
    fun `a failed online request restores the saved document and exact position without an extra history step`() = runTest {
        fixture { f ->
            f.save(11)
            f.model.navigateToReadingPosition(ReadNavigation(url(11), .25f))
            val saved = assertNotNull(f.model.savedChapter.value)
            f.model.handleOfflineEvent(saved, OfflineReaderEvent.Progress(60))
            runCurrent()
            f.model.reloadOnline()
            runCurrent()
            assertNull(f.model.savedChapter.value)
            assertTrue(saved.document.isActive())
            f.model.liveLoadFailed(null, null)
            assertSame(saved, f.model.savedChapter.value)
            assertEquals(.6f, f.model.scrollProgress.value)
            val restored = Regex("\"scrollPercentage\":([0-9.]+)").find(saved.document.initializationScript())!!.groupValues[1].toDouble()
            assertEquals(60.0, restored, .001)
            assertFalse(f.model.goBack())
        }
    }

    @Test
    fun `saved navigation uses canonical URLs restores position and leaves missing chapters and progress untouched`() = runTest {
        fixture { f ->
            f.save(11)
            f.save(22)
            f.model.navigateToReadingPosition(ReadNavigation(url(11), .42f))
            val first = assertNotNull(f.model.savedChapter.value)
            assertEquals(url(11), f.model.currentUrl.value)
            assertTrue(first.document.initializationScript().contains("\"scrollPercentage\":42.0"))
            f.model.handleOfflineEvent(first, OfflineReaderEvent.Ready)
            runCurrent()
            val before = f.accounts.database.chapterDao().getChapterById(11, 1)
            f.model.navigateToReadingPosition(ReadNavigation(url(33), 0f))
            assertSame(first, f.model.savedChapter.value)
            assertEquals(before, f.accounts.database.chapterDao().getChapterById(11, 1))
            assertNotNull(f.offline.message.value)
            f.model.navigateToReadingPosition(ReadNavigation(url(22), 0f))
            assertFalse(first.document.isActive())
            assertTrue(f.model.goBack())
            val restored = f.model.savedChapter.first { it?.document?.page?.chapterId == "11" }
            assertTrue(assertNotNull(restored).document.initializationScript().contains("\"scrollPercentage\":42.0"))
            assertEquals(url(11), f.model.currentUrl.value)
            assertTrue(f.model.goForward())
            f.model.savedChapter.first { it?.document?.page?.chapterId == "22" }
            assertEquals(url(22), f.model.currentUrl.value)
        }
    }

    @Test
    fun `offline progress creates only the read chapter and preserves newer metadata tags and deletions`() = runTest {
        fixture { f ->
            val repository = Ao3Repository(f.accounts)
            val metadata = assertNotNull(f.accounts.database.workDao().getWorkById(1))
            repository.recordOfflineReading(1, 22, 2, 60) { true }
            assertEquals(.6f, f.accounts.database.chapterDao().getChapterById(22, 1)?.readProgress)
            assertNull(f.accounts.database.chapterDao().getChapterById(33, 1))
            val changed = assertNotNull(f.accounts.database.workDao().getWorkById(1))
            assertEquals(metadata.copy(lastRead = changed.lastRead, rowUpdatedAt = changed.rowUpdatedAt), changed)
            assertEquals("New tag", f.accounts.database.tagDao().getAll().single().tag)
            f.accounts.edit { f.accounts.database.chapterDao().softDeleteChapter(22, 1, 200, 200) }
            val tombstone = f.accounts.database.chapterDao().getChapterByIdIncludingDeleted(22, 1)
            repository.recordOfflineReading(1, 22, 2, 100) { true }
            assertEquals(tombstone, f.accounts.database.chapterDao().getChapterByIdIncludingDeleted(22, 1))
            repository.deleteWork(1)
            val deleted = f.accounts.database.workDao().getWorkByIdIncludingDeleted(1)
            repository.recordOfflineReading(1, 33, 3, 80) { true }
            assertEquals(deleted, f.accounts.database.workDao().getWorkByIdIncludingDeleted(1))
            assertNull(f.accounts.database.chapterDao().getChapterByIdIncludingDeleted(33, 1))
        }
    }

    @Test
    fun `chapter zero reads use the canonical first chapter without reviving zero or replaying a reset`() = runTest {
        fixture { f ->
            f.accounts.edit {
                val dao = f.accounts.database.chapterDao()
                dao.upsertChapter(ChapterEntity(1, 0, 1, readProgress = .9f, rowCreatedAt = 1, rowUpdatedAt = 2, rowDeletedAt = 2))
                dao.upsertChapter(ChapterEntity(1, 11, 1, readProgress = 0f, lastReadAt = 200, rowCreatedAt = 1, rowUpdatedAt = 200))
            }
            val repository = Ao3Repository(f.accounts)
            repository.recordOfflineReading(1, 0, 1, null) { true }
            assertEquals(0f, f.accounts.database.chapterDao().getChapterById(11, 1)?.readProgress)
            assertNotNull(f.accounts.database.chapterDao().getChapterByIdIncludingDeleted(0, 1)?.rowDeletedAt)
            repository.recordOfflineReading(1, 0, 1, 45) { true }
            assertEquals(.45f, f.accounts.database.chapterDao().getChapterById(11, 1)?.readProgress)
        }
    }

    @Test
    fun `incognito and an account switch reject late saved reading messages`() = runTest {
        fixture { f ->
            f.save(11)
            f.model.navigateToReadingPosition(ReadNavigation(url(11), 0f))
            val opened = assertNotNull(f.model.savedChapter.value)
            f.settings.setIncognitoModeEnabled(true)
            f.model.handleOfflineEvent(opened, OfflineReaderEvent.Ready)
            f.model.handleOfflineEvent(opened, OfflineReaderEvent.Progress(50))
            runCurrent()
            assertEquals(.5f, f.model.scrollProgress.value)
            assertTrue(f.accounts.database.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
            f.settings.setIncognitoModeEnabled(false)
            f.model.handleOfflineEvent(opened, OfflineReaderEvent.Progress(50))
            runCurrent()
            assertEquals(.5f, f.accounts.database.chapterDao().getChapterById(11, 1)?.readProgress)
            f.accounts.activate("production:other")
            f.model.handleOfflineEvent(opened, OfflineReaderEvent.Progress(100))
            runCurrent()
            assertNull(f.model.savedChapter.value)
            assertTrue(f.accounts.database.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
        }
    }

    private suspend fun TestScope.fixture(connected: Boolean = false, block: suspend (Fixture) -> Unit) {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        val directory = Files.createTempDirectory("offline-reading-")
        val accounts = createTestAccounts(directory, dispatcher)
        val holder = directory.toString()
        try {
            accounts.initialize()
            val settings = AppSettings(null)
            val store = OfflineContentStore(accounts, DiskOfflineFiles(directory.resolve("files").toFile()))
            val offline = OfflineCoordinator(store, accounts, settings, Ao3RequestGate(), MutableStateFlow(OfflineNetwork(connected, connected)), true, backgroundScope)
            runCurrent()
            store.observeIdentity("user:fixture")
            val auth = object : SyncAuthentication {
                override val authState = MutableStateFlow<AuthState>(AuthState.Idle)
                override fun currentOwner(): String? = null
                override fun isCurrentSession(token: String, owner: String) = false
                override suspend fun invalidateSession() = Unit
            }
            val remote = object : SyncRemote {
                override suspend fun fetchSyncData(token: String, lastSyncedAt: String?, workCursor: Long?, limit: Int?): Result<SyncGetResponse> = error("Offline reading must not fetch sync")
                override suspend fun sendSyncData(token: String, request: SyncPostRequest): Result<SyncPostResponse> = error("Offline reading must not send sync")
            }
            val searches = SavedSearchRepository(accounts)
            val sync = SyncRepository(remote, auth, FavouriteTagRepository(accounts), searches, accounts)
            val coordinator = SyncCoordinator(sync, auth, accounts, signOut = {}, scope = backgroundScope)
            val model = ScreenModelStore.getOrPut(holder, null) { ReadScreenModel(Ao3Repository(accounts), searches, SyncTriggers(coordinator), accounts, settings, offline) }
            runCurrent()
            accounts.edit {
                accounts.database.workDao().upsertWork(WorkEntity(1, title = "New title", currentChapters = 3, rowCreatedAt = 1, rowUpdatedAt = 100))
                accounts.database.tagDao().upsertTags(listOf(TagEntity(1, "New tag", "/tags/new", 1, 100)))
            }
            block(Fixture(accounts, settings, offline, model))
        } finally {
            ScreenModelStore.onDisposeNavigator(holder)
            runCurrent()
            accounts.close()
            Dispatchers.resetMain()
            Files.walk(directory).use { it.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private class Fixture(val accounts: AccountDataStore, val settings: AppSettings, val offline: OfflineCoordinator, val model: ReadScreenModel) {
        suspend fun save(chapter: Long) {
            val page = OfflinePage(1, url(chapter), "1", chapter.toString(), "chapter", "Old title", "user:fixture", true,
                "<html><head></head><body><div id=\"chapters\">Story</div></body></html>", emptyList(),
                listOf(11L, 22L, 33L).mapIndexed { index, id -> OfflineChapter(id.toString(), index + 1, "Chapter ${index + 1}", url(id)) })
            offline.store.beginCapture(offline.store.context.value!!).publish(OfflineBundle(page, offlineSkinHash(emptyList()), emptyList(), emptyList()), true)
        }
    }

    companion object {
        private fun url(chapter: Long) = "https://archiveofourown.org/works/1/chapters/$chapter"
    }
}
