package com.qcksys.ao3tracker.data

import cafe.adriel.voyager.core.annotation.InternalVoyagerApi
import cafe.adriel.voyager.core.model.ScreenModelStore
import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.ChapterEntity
import com.qcksys.ao3tracker.data.database.TagEntity
import com.qcksys.ao3tracker.data.database.WorkEntity
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.model.ChapterInfo
import com.qcksys.ao3tracker.data.model.ScrollProgressEvent
import com.qcksys.ao3tracker.data.model.SyncGetResponse
import com.qcksys.ao3tracker.data.model.SyncPostRequest
import com.qcksys.ao3tracker.data.model.SyncPostResponse
import com.qcksys.ao3tracker.data.model.TagInfo
import com.qcksys.ao3tracker.data.model.WorkChapterIndexEvent
import com.qcksys.ao3tracker.data.model.WorkInfoEvent
import com.qcksys.ao3tracker.data.model.WorkTagsEvent
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.sync.SyncRemote
import com.qcksys.ao3tracker.data.sync.SyncRepository
import com.qcksys.ao3tracker.data.sync.SyncTriggers
import com.qcksys.ao3tracker.ui.components.ReaderLinkAction
import com.qcksys.ao3tracker.ui.screens.read.ReadScreenModel
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@OptIn(ExperimentalCoroutinesApi::class, InternalVoyagerApi::class)
class IncognitoReadingTest {
    @Test
    fun `saved search updates apply current filters in incognito and refresh the page state`() = runTest {
        fixture { f ->
            val searches = SavedSearchRepository(f.accounts)
            val saved = searches.save("My stories", "https://archiveofourown.org/works")
            searches.markSynced(saved)
            val url = "https://archiveofourown.org/works?work_search%5Bquery%5D=fluff"
            val scripts = mutableListOf<String>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                f.model.jsInjectionFlow.collect { scripts.add(it) }
            }
            f.settings.setIncognitoModeEnabled(true)
            f.model.handleWebViewMessage("""{"type":"browsingReady","url":"$url"}""")
            f.model.handleWebViewMessage("""{"type":"saveSearch","url":"$url","name":"New filters"}""")
            advanceUntilIdle()
            assertNotNull(f.model.pendingSaveSearch.value)
            f.model.confirmUpdateSavedSearch(saved.id, url)
            advanceUntilIdle()
            assertNull(f.model.pendingSaveSearch.value)
            val updated = searches.getPendingSync().single()
            assertEquals(saved.id, updated.id)
            assertEquals(saved.name, updated.name)
            assertEquals(url, updated.url)
            assertEquals(1, f.db.savedSearchDao().getAll().size)
            assertTrue(scripts.last { it.contains("applyBrowsingState") }.contains(url))
        }
    }

    @Test
    fun `queued saved search update cannot edit a different account`() = runTest {
        fixture { f ->
            val searches = SavedSearchRepository(f.accounts)
            val saved = searches.save("Guest stories", "https://archiveofourown.org/works")
            f.model.confirmUpdateSavedSearch(saved.id, "https://archiveofourown.org/bookmarks")
            f.accounts.activate("PRODUCTION:other")
            f.db.savedSearchDao().upsert(saved.copy(name = "Account stories"))
            advanceUntilIdle()
            assertEquals(saved.url, f.db.savedSearchDao().getOne(saved.id)?.url)
            f.accounts.activate(AccountDataStore.GUEST)
            assertEquals(saved, f.db.savedSearchDao().getOne(saved.id))
        }
    }

    @Test
    fun `diagnostic bridge discards messages queued before a consent change`() = runTest {
        fixture { f ->
            val sent = mutableListOf<String>()
            val client = com.qcksys.ao3tracker.diagnostics.DiagnosticsClient(
                f.settings, "desktop", { _, request -> sent.add(request.data.toString()) }, backgroundScope
            )
            com.qcksys.ao3tracker.diagnostics.Diagnostics.install(client)
            try {
                runCurrent()
                val event = """{"type":"diagnostic","data":{"event":"webview_ready"}}"""
                f.model.handleWebViewMessage(event)
                f.settings.setDiagnosticDataEnabled(false)
                f.settings.setDiagnosticDataEnabled(true)
                runCurrent()
                assertTrue(sent.isEmpty())
                f.model.handleWebViewMessage(event)
                runCurrent()
                assertEquals(1, sent.size)
            } finally {
                com.qcksys.ao3tracker.diagnostics.Diagnostics.uninstall(client)
                client.close()
            }
        }
    }

    @Test
    fun `explicit link actions track unread works and update blocklists in incognito`() = runTest {
        fixture { f ->
            val pageUrl = "https://archiveofourown.org/works/search"
            val scripts = mutableListOf<String>()
            val messages = mutableListOf<String>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                f.model.jsInjectionFlow.collect { scripts.add(it) }
            }
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                f.model.linkActionMessage.collect { messages.add(it) }
            }
            f.settings.setIncognitoModeEnabled(true)
            f.settings.setHiddenTags("Angst")
            f.model.updateCurrentUrl(pageUrl)
            f.model.handleWebViewMessage("""{"type":"browsingReady","url":"$pageUrl"}""")
            advanceUntilIdle()

            f.model.handleLinkAction(ReaderLinkAction.TrackWork(123, "A new work"))
            advanceUntilIdle()
            val work = assertNotNull(f.db.workDao().getWorkById(123))
            assertEquals("A new work", work.title)
            assertTrue(work.subscribed)
            assertNotNull(work.lastRead)
            assertTrue(f.db.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
            assertEquals("not-started", f.repository.getWorkBadges(listOf(123)).single().status)
            assertTrue(scripts.any { it.contains("applyListBadges") && it.contains("not-started") })
            assertEquals(pageUrl, f.model.currentUrl.value)

            f.model.handleLinkAction(ReaderLinkAction.BlockTag("Alice/Bob"))
            f.model.handleLinkAction(ReaderLinkAction.BlockTag("alice/bob"))
            f.model.handleLinkAction(ReaderLinkAction.BlockWork(123))
            f.model.handleLinkAction(ReaderLinkAction.BlockWork(123))
            advanceUntilIdle()
            assertEquals(listOf("Angst", "Alice/Bob"), f.settings.browsingPreferences.value.hiddenTags)
            assertEquals(listOf(123L), f.settings.browsingPreferences.value.hiddenWorkIds)
            assertTrue(scripts.any { it.contains("applyBrowsingState") && it.contains("Alice/Bob") })
            assertEquals(work, f.db.workDao().getWorkById(123))
            assertEquals("Added to tracked works", messages.first())
        }
    }

    @Test
    fun `adding an existing work preserves metadata flags and progress`() = runTest {
        fixture { f ->
            f.seedTrackedWork()
            val work = f.db.workDao().getWorkById(1)
            val chapters = f.db.chapterDao().getAllChaptersIncludingDeletedOnce()
            val tags = f.db.tagDao().getAll()
            f.repository.addTrackedWork(1, "Another link title")
            assertEquals(work, f.db.workDao().getWorkById(1))
            assertEquals(chapters, f.db.chapterDao().getAllChaptersIncludingDeletedOnce())
            assertEquals(tags, f.db.tagDao().getAll())
        }
    }

    @Test
    fun `tracking a deleted work restores it with a newer sync clock`() = runTest {
        fixture { f ->
            f.seedTrackedWork()
            f.repository.deleteWork(1)
            val deleted = assertNotNull(f.db.workDao().getWorkByIdIncludingDeleted(1))
            f.repository.addTrackedWork(1, "Another link title")
            val restored = assertNotNull(f.db.workDao().getWorkById(1))
            assertNull(restored.rowDeletedAt)
            assertTrue(assertNotNull(restored.lastRead) > assertNotNull(deleted.lastRead))
            assertEquals("Original", restored.title)
            assertEquals(0.25f, f.db.chapterDao().getChapterById(11, 1)?.readProgress)
        }
    }

    @Test
    fun `queued link tracking cannot write to a replacement account`() = runTest {
        fixture { f ->
            f.model.handleLinkAction(ReaderLinkAction.TrackWork(123, "Old account"))
            f.accounts.activate("other-account")
            advanceUntilIdle()
            assertNull(f.db.workDao().getWorkById(123))
        }
    }

    @Test
    fun `browsing controls work while incognito and push preference and saved search changes`() = runTest {
        fixture { f ->
            val pageUrl = "https://archiveofourown.org/works/search?work_search[query]=test"
            val scripts = mutableListOf<String>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                f.model.jsInjectionFlow.collect { scripts.add(it) }
            }
            f.settings.setIncognitoModeEnabled(true)
            f.model.updateCurrentUrl(pageUrl)
            f.model.handleWebViewMessage("""{"type":"browsingReady","url":"$pageUrl"}""")
            advanceUntilIdle()
            assertTrue(scripts.any { it.contains("applyBrowsingState") && it.contains("savedSearchUrls") })

            f.model.handleWebViewMessage("""{"type":"setWorkHidden","url":"$pageUrl","workId":123,"hidden":true}""")
            advanceUntilIdle()
            assertEquals(listOf(123L), f.settings.browsingPreferences.value.hiddenWorkIds)
            assertTrue(scripts.last().contains("\"hiddenWorkIds\":[123]"))

            f.settings.setHiddenTags("Angst")
            advanceUntilIdle()
            assertTrue(scripts.last().contains("\"hiddenTags\":[\"Angst\"]"))

            f.model.confirmSaveSearch("My search", pageUrl)
            advanceUntilIdle()
            assertTrue(scripts.last().contains("\"savedSearchUrls\":[\"$pageUrl\"]"))
            assertTrue(f.db.workDao().getAllWorksIncludingDeletedOnce().isEmpty())

            f.model.handleWebViewMessage("""{"type":"setWorkHidden","url":"https://example.com/works","workId":456,"hidden":true}""")
            advanceUntilIdle()
            assertEquals(listOf(123L), f.settings.browsingPreferences.value.hiddenWorkIds)
        }
    }

    @Test
    fun `initial account initialization preserves an external reading URL`() = runTest {
        val externalUrl = "${url()}?view_adult=true&view_full_work=true#comment_123"
        fixture(beforeInitialization = { it.model.navigateToExternalUrl(externalUrl) }) { f ->
            assertEquals(externalUrl, f.model.currentUrl.value)
        }
    }

    @Test
    fun `leaving incognito requests exactly one fresh reading snapshot`() = runTest {
        fixture { f ->
            val scripts = mutableListOf<String>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                f.model.jsInjectionFlow.collect { scripts.add(it) }
            }
            f.settings.setIncognitoModeEnabled(true)
            advanceUntilIdle()
            assertEquals(listOf("window.__ao3Tracker?.setDiagnosticsEnabled?.(false);"), scripts)
            scripts.clear()

            f.settings.setIncognitoModeEnabled(false)
            advanceUntilIdle()
            assertEquals(1, scripts.count { it.contains("reportReadingActivity") })
            assertEquals(1, scripts.count { it.contains("setDiagnosticsEnabled?.(true)") })

            f.settings.setIncognitoModeEnabled(false)
            advanceUntilIdle()
            assertEquals(2, scripts.size)
        }
    }

    @Test
    fun `tracking sessions stay invalid after a rapid incognito round trip`() {
        val settings = AppSettings(null)
        assertFalse(settings.incognitoModeEnabled.value)
        val original = assertNotNull(settings.captureTrackingSession())
        settings.setIncognitoModeEnabled(false)
        assertTrue(settings.isTrackingSessionCurrent(original))

        settings.setIncognitoModeEnabled(true)
        assertTrue(settings.incognitoModeEnabled.value)
        assertNull(settings.captureTrackingSession())
        assertFalse(settings.isTrackingSessionCurrent(original))
        settings.setIncognitoModeEnabled(false)
        assertFalse(settings.isTrackingSessionCurrent(original))
        val resumed = assertNotNull(settings.captureTrackingSession())
        assertNotEquals(original, resumed)
        assertTrue(settings.isTrackingSessionCurrent(resumed))
    }

    @Test
    fun `incognito discards every reading message without creating rows`() = runTest {
        fixture { f ->
            val before = f.snapshot()
            f.settings.setIncognitoModeEnabled(true)
            f.post(info())
            f.post(tags())
            f.post(index())
            f.post(scroll(100))
            advanceUntilIdle()

            assertEquals(before, f.snapshot())
            assertTrue(f.db.workDao().getAllWorksIncludingDeletedOnce().isEmpty())
            assertTrue(f.db.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
            assertTrue(f.db.tagDao().getAll().isEmpty())
        }
    }

    @Test
    fun `incognito preserves tracked metadata progress and last read timestamps`() = runTest {
        fixture { f ->
            f.seedTrackedWork()
            val before = f.snapshot()
            f.settings.setIncognitoModeEnabled(true)
            f.post(info().copy(workName = "Private browsing title", wordCount = "9999"))
            f.post(tags("Private browsing tag"))
            f.post(index())
            f.post(scroll(100))
            advanceUntilIdle()

            assertEquals(before, f.snapshot())
            assertEquals(0.25f, f.db.chapterDao().getChapterById(11, 1)?.readProgress)
            assertEquals(100L, f.db.workDao().getWorkById(1)?.lastRead)
            assertNull(f.db.chapterDao().getChapterById(22, 1))
        }
    }

    @Test
    fun `new reading events persist normally after leaving incognito`() = runTest {
        fixture { f ->
            f.settings.setIncognitoModeEnabled(true)
            f.post(info())
            advanceUntilIdle()
            f.settings.setIncognitoModeEnabled(false)

            f.post(info())
            advanceUntilIdle()
            f.post(tags())
            advanceUntilIdle()
            f.post(index())
            advanceUntilIdle()
            f.post(scroll(75))
            advanceUntilIdle()

            assertEquals("Tracked work", f.db.workDao().getWorkById(1)?.title)
            assertEquals(0.75f, f.db.chapterDao().getChapterById(11, 1)?.readProgress)
            assertNotNull(f.db.chapterDao().getChapterById(22, 1))
            assertEquals(listOf("Fluff"), f.db.tagDao().getTagsByWorkOnce(1).map { it.tag })
            assertTrue(assertNotNull(f.db.workDao().getWorkById(1)?.lastRead) > 100L)
        }
    }

    @Test
    fun `rapid mode changes reject callbacks already queued by the WebView`() = runTest {
        fixture { f ->
            val before = f.snapshot()
            f.post(info())
            f.post(tags())
            f.post(index())
            f.post(scroll(100))
            // The Main dispatcher has not run these callbacks yet.
            f.settings.setIncognitoModeEnabled(true)
            f.settings.setIncognitoModeEnabled(false)
            advanceUntilIdle()

            assertEquals(before, f.snapshot())
            f.post(info())
            advanceUntilIdle()
            assertNotNull(f.db.workDao().getWorkById(1))
        }
    }

    @Test
    fun `mode changes clear pending work info before a later tag message`() = runTest {
        fixture { f ->
            f.post(info())
            advanceUntilIdle()
            val before = f.snapshot()
            f.settings.setIncognitoModeEnabled(true)
            f.settings.setIncognitoModeEnabled(false)
            f.post(tags("Should not attach to cached info"))
            advanceUntilIdle()

            assertEquals(before, f.snapshot())
        }
    }

    @Test
    fun `mode changes clear pending tags before a later work info message`() = runTest {
        fixture { f ->
            f.post(tags("Should not survive mode change"))
            advanceUntilIdle()
            f.settings.setIncognitoModeEnabled(true)
            f.settings.setIncognitoModeEnabled(false)
            f.post(info())
            advanceUntilIdle()

            assertNotNull(f.db.workDao().getWorkById(1))
            assertTrue(f.db.tagDao().getTagsByWorkOnce(1).isEmpty())
        }
    }

    @Test
    fun `chapter navigation after mode changes does not complete the previous chapter`() = runTest {
        fixture { f ->
            f.post(info())
            advanceUntilIdle()
            f.post(scroll(25))
            advanceUntilIdle()
            val previous = assertNotNull(f.db.chapterDao().getChapterById(11, 1))
            f.settings.setIncognitoModeEnabled(true)
            f.settings.setIncognitoModeEnabled(false)
            f.post(info(chapterId = 22))
            advanceUntilIdle()

            assertEquals(previous, f.db.chapterDao().getChapterById(11, 1))
            assertNull(f.db.chapterDao().getChapterById(11, 1)?.markedCompleteAt)
            assertNotNull(f.db.chapterDao().getChapterById(22, 1))
        }
    }

    @Test
    fun `repository entrypoints reject a stale tracking session before writing`() = runTest {
        fixture { f ->
            f.seedTrackedWork()
            val before = f.snapshot()
            val session = assertNotNull(f.settings.captureTrackingSession())
            f.settings.setIncognitoModeEnabled(true)
            f.settings.setIncognitoModeEnabled(false)
            val canTrack = { f.settings.isTrackingSessionCurrent(session) }

            assertFailsWith<CancellationException> {
                f.repository.saveWorkFromWebView(info(), tags(), canTrack)
            }
            assertFailsWith<CancellationException> {
                f.repository.saveChapterIndex(index(), canTrack)
            }
            assertFailsWith<CancellationException> {
                f.repository.updateScrollProgress(scroll(100), canTrack)
            }
            assertFailsWith<CancellationException> {
                f.repository.markChapterAsRead(11, 1, canTrack)
            }
            assertEquals(before, f.snapshot())
        }
    }

    @Test
    fun `an incognito toggle during a transaction rolls back writes and revision`() = runTest {
        fixture { f ->
            val before = f.snapshot()
            val session = assertNotNull(f.settings.captureTrackingSession())
            var wroteInsideTransaction = false
            assertFailsWith<CancellationException> {
                f.accounts.edit(isCurrentOperation = { f.settings.isTrackingSessionCurrent(session) }) {
                    f.db.workDao().upsertWork(work())
                    assertNotNull(f.db.workDao().getWorkById(1))
                    wroteInsideTransaction = true
                    f.settings.setIncognitoModeEnabled(true)
                    f.settings.setIncognitoModeEnabled(false)
                }
            }

            assertTrue(wroteInsideTransaction)
            assertEquals(before, f.snapshot())
        }
    }

    private suspend fun TestScope.fixture(
        beforeInitialization: (Fixture) -> Unit = {},
        block: suspend (Fixture) -> Unit
    ) {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        val directory = Files.createTempDirectory("ao3tracker-incognito-")
        val accounts = createTestAccounts(directory, dispatcher)
        val modelHolder = "incognito-test:${directory.fileName}"
        try {
            val f = Fixture(accounts, modelHolder)
            beforeInitialization(f)
            f.accounts.initialize()
            f.accounts.activate(AccountDataStore.GUEST)
            runCurrent()
            block(f)
        } finally {
            ScreenModelStore.onDisposeNavigator(modelHolder)
            runCurrent()
            accounts.close()
            Dispatchers.resetMain()
            Files.walk(directory).use { paths ->
                paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
            }
        }
    }

    private class Fixture(val accounts: AccountDataStore, modelHolder: String) {
        val db get() = accounts.database
        val settings = AppSettings(null)
        val repository = Ao3Repository(accounts)
        private val searches = SavedSearchRepository(accounts)
        private val favourites = FavouriteTagRepository(accounts)
        private val auth = object : SyncAuthentication {
            override val authState = MutableStateFlow<AuthState>(AuthState.Idle)
            override fun currentOwner(): String? = null
            override fun isCurrentSession(token: String, owner: String) = false
            override suspend fun invalidateSession() = Unit
        }
        private val remote = object : SyncRemote {
            override suspend fun fetchSyncData(
                token: String,
                lastSyncedAt: String?,
                workCursor: Long?,
                limit: Int?
            ): Result<SyncGetResponse> = error("Reading tests must not fetch remote state")

            override suspend fun sendSyncData(
                token: String,
                request: SyncPostRequest
            ): Result<SyncPostResponse> = error("Reading tests must not send remote state")
        }
        private val sync = SyncRepository(remote, auth, favourites, searches, accounts)
        val model = ScreenModelStore.getOrPut(modelHolder, null) {
            ReadScreenModel(repository, searches, SyncTriggers(sync), accounts, settings)
        }

        suspend fun seedTrackedWork() = accounts.edit {
            db.workDao().upsertWork(work())
            db.chapterDao().upsertChapter(ChapterEntity(
                workId = 1,
                chapterId = 11,
                readProgress = 0.25f,
                lastReadAt = 100,
                rowCreatedAt = 100,
                rowUpdatedAt = 100
            ))
            db.tagDao().upsertTags(listOf(TagEntity(1, "Original", "/tags/Original/works", 7, 100)))
        }

        suspend fun snapshot() = Snapshot(
            db.workDao().getAllWorksIncludingDeletedOnce(),
            db.chapterDao().getAllChaptersIncludingDeletedOnce(),
            db.tagDao().getAll(),
            accounts.localRevision
        )
    }

    private data class Snapshot(
        val works: List<WorkEntity>,
        val chapters: List<ChapterEntity>,
        val tags: List<TagEntity>,
        val revision: Long
    )

    private inline fun <reified T> Fixture.post(event: T) {
        model.handleWebViewMessage(messages.encodeToString(event))
    }

    companion object {
        private val messages = Json { encodeDefaults = true }
        private fun url(chapterId: Long = 11) = "https://archiveofourown.org/works/1/chapters/$chapterId"
        private fun work() = WorkEntity(id = 1, title = "Original", lastRead = 100, rowCreatedAt = 100, rowUpdatedAt = 100)
        private fun info(chapterId: Long = 11) = WorkInfoEvent(
            url = url(chapterId),
            workName = "Tracked work",
            chapterId = chapterId.toString(),
            chapterNumber = if (chapterId == 11L) "1" else "2",
            totalChapters = "2/3"
        )
        private fun tags(tag: String = "Fluff") = WorkTagsEvent(
            url = url(),
            freeform = listOf(TagInfo(tag, "/tags/$tag/works"))
        )
        private fun index() = WorkChapterIndexEvent(
            url = "https://archiveofourown.org/works/1/navigate",
            chapters = listOf(
                ChapterInfo(chapterNumber = "Chapter 1", chapterUrl = "/works/1/chapters/11"),
                ChapterInfo(chapterNumber = "Chapter 2", chapterUrl = "/works/1/chapters/22")
            )
        )
        private fun scroll(percentage: Int) = ScrollProgressEvent(
            url = url(),
            scrollPercentage = percentage,
            chapterId = "11"
        )
    }
}
