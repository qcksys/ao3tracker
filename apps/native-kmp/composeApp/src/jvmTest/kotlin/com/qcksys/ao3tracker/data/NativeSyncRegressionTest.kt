package com.qcksys.ao3tracker.data

import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.auth.AuthService
import com.qcksys.ao3tracker.data.auth.SessionTokenStorage
import com.qcksys.ao3tracker.data.database.*
import com.qcksys.ao3tracker.data.model.*
import com.qcksys.ao3tracker.data.repository.*
import com.qcksys.ao3tracker.data.sync.*
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.ApiEnvironment
import androidx.sqlite.execSQL
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*

class NativeSyncRegressionTest {
    @Test
    fun `account switches preserve pending data and restore account cursors`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.workDao().upsertWork(work(1).copy(rowDeletedAt = 50))
                f.db.savedSearchDao().upsert(search("a"))
                f.db.favouriteTagDao().upsert(FavouriteTagEntity(4, "Fluff", true, 100, true))
            }
            f.accounts.forAccount("production:a", { true }) { f.accounts.saveSyncCursors(FIRST, 100) }
            f.accounts.activate("production:b")
            assertTrue(f.db.workDao().getAllWorksIncludingDeletedOnce().isEmpty())
            assertNull(f.accounts.active.value?.remoteCursor)
            f.accounts.edit { f.db.workDao().upsertWork(work(2)) }
            f.accounts.activate("production:a")
            assertEquals(50L, f.db.workDao().getWorkByIdIncludingDeleted(1)?.rowDeletedAt)
            assertTrue(f.db.savedSearchDao().getOne("a")!!.pendingSync)
            assertTrue(f.db.favouriteTagDao().getOne(4, "Fluff")!!.pendingSync)
            assertEquals(FIRST, f.accounts.active.value?.remoteCursor)
            f.accounts.activate("development:a")
            assertTrue(f.db.workDao().getAllWorksIncludingDeletedOnce().isEmpty())
            f.accounts.activate("production:b")
            assertEquals(listOf(2L), f.db.workDao().getAllWorkIds())
        }
    }

    @Test
    fun `signed out guest data is not uploaded to the next account`() = runTest {
        fixture { f ->
            f.accounts.activate(AccountDataStore.GUEST)
            f.accounts.edit { f.db.workDao().upsertWork(work(9)) }
            f.accounts.activate("production:b")
            f.auth.owner = "production:b"
            assertIs<SyncResult.Success>(f.sync.sync(forceFull = true))
            assertTrue(f.remote.sent.isEmpty())
            f.accounts.activate(AccountDataStore.GUEST)
            assertNotNull(f.db.workDao().getWorkById(9))
        }
    }

    @Test
    fun `guest import uploads old reading data on the next incremental sync`() = runTest {
        fixture { f ->
            f.accounts.activate(AccountDataStore.GUEST)
            f.accounts.edit {
                f.db.workDao().upsertWork(work(1))
                f.db.chapterDao().upsertChapter(chapter())
                f.db.savedSearchDao().upsert(search("guest").copy(pendingSync = false))
                f.db.favouriteTagDao().upsert(FavouriteTagEntity(4, "Fluff", true, 100, false))
            }
            f.accounts.activate("production:a")
            f.accounts.forAccount("production:a", { true }) { f.accounts.saveSyncCursors(FIRST, 1_000) }
            f.accounts.importGuest("production:a") { true }
            assertIs<SyncResult.Success>(f.sync.sync())
            val sent = f.remote.sent.single()
            assertEquals(listOf(1L), sent.works.map { it.workId })
            assertEquals(listOf(2L), sent.chapters.map { it.chapterId })
            assertEquals(1, sent.favouriteTags?.size)
            assertEquals(1, sent.savedSearches?.size)
            assertFalse(f.db.savedSearchDao().getOne("guest")!!.pendingSync)
            f.remote.sent.clear()
            assertTrue(f.accounts.importGuest("production:a") { true }.isEmpty)
            assertIs<SyncResult.Success>(f.sync.sync())
            assertTrue(f.remote.sent.isEmpty())
        }
    }

    @Test
    fun `signing out and changing accounts preserves each library and guest import is explicit`() = runTest {
        fixture { f ->
            val settings = AppSettings(null)
            val tokens = MemoryTokens()
            val service = FakeAuthService(settings)
            val auth = AuthRepository(service, tokens, f.accounts, settings)
            try {
                auth.initialize()
                f.accounts.edit { f.db.workDao().upsertWork(work(9)) }
                auth.signIn("a", "password")
                assertTrue(f.db.workDao().getAllWorkIds().isEmpty())
                assertEquals(1, auth.importGuestData("PRODUCTION:a").works)
                f.accounts.edit { f.db.workDao().upsertWork(work(1)) }
                auth.signOut()
                assertEquals(listOf(9L), f.db.workDao().getAllWorkIds())
                auth.signIn("b", "password")
                assertTrue(f.db.workDao().getAllWorkIds().isEmpty())
                assertFailsWith<IllegalStateException> { auth.importGuestData("PRODUCTION:a") }
                auth.signOut()
                auth.signIn("a", "password")
                assertEquals(setOf(1L, 9L), f.db.workDao().getAllWorkIds().toSet())
            } finally { service.getClient().close() }
        }
    }

    @Test
    fun `a stale response cannot merge into the newly active account`() = runTest {
        fixture { f ->
            f.remote.onFetch = {
                f.auth.owner = "production:b"
                f.accounts.activate("production:b")
                Result.success(response(works = listOf(SyncWorkResponse(99, FIRST))))
            }
            assertIs<SyncResult.NotAuthenticated>(f.sync.sync())
            assertNull(f.db.workDao().getWorkById(99))
            assertTrue(f.remote.sent.isEmpty())
            assertNull(f.accounts.active.value?.remoteCursor)
        }
    }

    @Test
    fun `full sync preserves a pending deletion while merging metadata`() = runTest {
        fixture { f ->
            f.accounts.edit { f.db.workDao().upsertWork(work(1).copy(lastRead = 2_000_000_000_000, rowDeletedAt = 2_000_000_000_000)) }
            f.remote.onFetch = {
                Result.success(response(
                    works = listOf(SyncWorkResponse(1, FIRST)),
                    metadata = listOf(SyncWorkMetadata(
                        id = 1, title = "Title", author = "Author", language = "English",
                        wordCount = 100, currentChapters = 1, hits = 1, kudos = 1,
                        bookmarks = 1, comments = 1, published = FIRST, lastUpdated = FIRST
                    ))
                ))
            }
            assertIs<SyncResult.Success>(f.sync.sync(forceFull = true))
            assertEquals(2_000_000_000_000L, f.db.workDao().getWorkByIdIncludingDeleted(1)?.rowDeletedAt)
            assertTrue(f.remote.sent.single().works.single().deleted)
        }
    }

    @Test
    fun `the next pull starts at the first page watermark`() = runTest {
        fixture { f ->
            f.remote.onFetch = { cursor ->
                Result.success(if (cursor == null) response(marker = FIRST, more = true, cursor = 1)
                    else response(marker = SECOND))
            }
            assertIs<SyncResult.Success>(f.sync.sync())
            assertEquals(FIRST, f.accounts.active.value?.remoteCursor)
        }
    }

    @Test
    fun `an old upload cannot acknowledge newer search or favourite edits`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.savedSearchDao().upsert(search("a"))
                f.db.favouriteTagDao().upsert(FavouriteTagEntity(4, "Fluff", true, 100, true))
            }
            f.remote.onSend = {
                f.searches.rename("a", "New name")
                f.favourites.toggleFavourite(TagType.FANDOM, "Fluff")
                Result.success(accepted())
            }
            assertIs<SyncResult.Success>(f.sync.sync())
            assertEquals("New name", f.db.savedSearchDao().getOne("a")?.name)
            assertTrue(f.db.savedSearchDao().getOne("a")!!.pendingSync)
            assertTrue(f.db.favouriteTagDao().getOne(4, "Fluff")!!.pendingSync)
        }
    }

    @Test
    fun `server wins equal timestamp values for saved rows`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.savedSearchDao().upsert(search("a"))
                f.db.favouriteTagDao().upsert(FavouriteTagEntity(4, "Fluff", true, 100, true))
                f.searches.applyRemote(listOf(RemoteSavedSearch("a", "Server", "https://archiveofourown.org/works", true, 100)))
                f.favourites.applyRemote(listOf(RemoteFavouriteTag(4, "Fluff", false, 100)))
            }
            assertEquals("Server", f.db.savedSearchDao().getOne("a")?.name)
            assertTrue(f.db.savedSearchDao().getOne("a")!!.deleted)
            assertFalse(f.db.favouriteTagDao().getOne(4, "Fluff")!!.favourited)
        }
    }

    @Test
    fun `mark unread uploads a newer zero progress event`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.workDao().upsertWork(work(1).copy(markedCompleteAt = 100))
                f.db.chapterDao().upsertChapter(chapter())
            }
            f.works.markChapterAsUnread(2, 1)
            assertIs<SyncResult.Success>(f.sync.sync())
            val sent = f.remote.sent.single().chapters.single()
            assertEquals(0f, sent.readProgress)
            assertNull(sent.markedCompleteAt)
            assertNotEquals("1970-01-01T00:00:00.100Z", sent.lastReadAt)
            assertNull(f.remote.sent.single().works.single().markedCompleteAt)
            assertEquals(sent.lastReadAt, f.remote.sent.single().works.single().lastReadAt)
        }
    }

    @Test
    fun `marking a work unread clears completion and advances all reading clocks`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.workDao().upsertWork(work(1).copy(lastRead = 2_000_000_000_000, markedCompleteAt = 2_000_000_000_000))
                f.db.chapterDao().upsertChapter(chapter().copy(lastReadAt = 2_000_000_000_100))
            }
            f.works.markWorkAsUnread(1)
            assertIs<SyncResult.Success>(f.sync.sync())
            val sent = f.remote.sent.single()
            assertNull(sent.works.single().markedCompleteAt)
            assertNull(sent.chapters.single().markedCompleteAt)
            assertEquals(0f, sent.chapters.single().readProgress)
            assertEquals(sent.works.single().lastReadAt, sent.chapters.single().lastReadAt)
            assertEquals(2_000_000_000_101L, f.db.workDao().getWorkById(1)!!.lastRead)
        }
    }

    @Test
    fun `a newer remote unread event resets completed local progress`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.workDao().upsertWork(work(1).copy(markedCompleteAt = 100))
                f.db.chapterDao().upsertChapter(chapter())
            }
            f.remote.onFetch = {
                Result.success(response(
                    works = listOf(SyncWorkResponse(1, FIRST)),
                    chapters = listOf(SyncChapterResponse(1, 2, FIRST, readProgress = 0f))
                ))
            }
            assertIs<SyncResult.Success>(f.sync.sync())
            val chapter = f.db.chapterDao().getChapterById(2, 1)!!
            assertEquals(0f, chapter.readProgress)
            assertNull(chapter.markedCompleteAt)
            assertNull(f.db.workDao().getWorkById(1)!!.markedCompleteAt)
        }
    }

    @Test
    fun `server reading ties replace completion privacy and legacy flags`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.workDao().upsertWork(work(1).copy(markedCompleteAt = 100, subscribed = true, favourite = false))
                f.db.chapterDao().upsertChapter(chapter())
            }
            f.remote.onFetch = { Result.success(response(
                works = listOf(SyncWorkResponse(1, "1970-01-01T00:00:00.100Z", private = true, subscribed = false, favourite = true)),
                chapters = listOf(SyncChapterResponse(1, 2, "1970-01-01T00:00:00.100Z", readProgress = 0f))
            )) }
            assertIs<SyncResult.Success>(f.sync.sync())
            val saved = f.db.workDao().getWorkById(1)!!
            assertNull(saved.markedCompleteAt)
            assertTrue(saved.isPrivate)
            assertFalse(saved.subscribed)
            assertTrue(saved.favourite)
            assertNull(saved.subscribedUpdatedAt)
            assertNull(saved.favouriteUpdatedAt)
            assertNull(f.db.chapterDao().getChapterById(2, 1)!!.markedCompleteAt)
            assertEquals(0f, f.db.chapterDao().getChapterById(2, 1)!!.readProgress)
        }
    }

    @Test
    fun `unchanged flags retain newer clocks and reject older opposite values`() = runTest {
        fixture { f ->
            f.accounts.edit { f.db.workDao().upsertWork(work(1).copy(
                subscribed = true, subscribedUpdatedAt = 100, favourite = true, favouriteUpdatedAt = 100
            )) }
            f.remote.onFetch = { Result.success(response(works = listOf(SyncWorkResponse(
                1, FIRST, subscribed = true, favourite = true, subscribedUpdatedAt = SECOND, favouriteUpdatedAt = SECOND
            )))) }
            assertIs<SyncResult.Success>(f.sync.sync())
            f.remote.onFetch = { Result.success(response(works = listOf(SyncWorkResponse(
                1, SECOND, subscribed = false, favourite = false, subscribedUpdatedAt = FIRST, favouriteUpdatedAt = FIRST
            )))) }
            assertIs<SyncResult.Success>(f.sync.sync())
            val saved = f.db.workDao().getWorkById(1)!!
            assertTrue(saved.subscribed)
            assertTrue(saved.favourite)
            assertEquals(1_767_225_601_000, saved.subscribedUpdatedAt)
            assertEquals(saved.subscribedUpdatedAt, saved.favouriteUpdatedAt)
        }
    }

    @Test
    fun `root work URLs save progress against the extracted chapter id`() = runTest {
        fixture { f ->
            f.works.saveWorkFromWebView(WorkInfoEvent(url = "https://archiveofourown.org/works/1", chapterId = "2"), null)
            f.works.updateScrollProgress(ScrollProgressEvent(url = "https://archiveofourown.org/works/1", scrollPercentage = 75, chapterId = "2"))
            assertEquals(.75f, f.db.chapterDao().getChapterById(2, 1)?.readProgress)
            assertNull(f.db.chapterDao().getChapterById(0, 1))
        }
    }

    @Test
    fun `failed sync and clear retains all local data`() = runTest {
        fixture { f ->
            f.accounts.edit { f.db.workDao().upsertWork(work(1)) }
            f.remote.onSend = { Result.failure(Exception("Offline")) }
            assertIs<SyncResult.Error>(f.sync.sync(forceFull = true, clearOnSuccess = true))
            assertNotNull(f.db.workDao().getWorkById(1))
        }
    }

    @Test
    fun `sync and clear refuses to delete edits made during upload`() = runTest {
        fixture { f ->
            f.accounts.edit { f.db.workDao().upsertWork(work(1)) }
            f.remote.onSend = {
                f.works.updateWorkFavourite(1, true)
                Result.success(accepted())
            }
            assertIs<SyncResult.Error>(f.sync.sync(forceFull = true, clearOnSuccess = true))
            assertTrue(f.db.workDao().getWorkById(1)!!.favourite)
        }
    }

    @Test
    fun `successful sync and clear clears only the current account and resets cursors`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.workDao().upsertWork(work(1))
                f.db.savedSearchDao().upsert(search("a"))
            }
            assertIs<SyncResult.Success>(f.sync.sync(forceFull = true, clearOnSuccess = true))
            assertTrue(f.db.workDao().getAllWorksIncludingDeletedOnce().isEmpty())
            assertTrue(f.db.savedSearchDao().getAll().isEmpty())
            assertNull(f.accounts.active.value?.remoteCursor)
        }
    }

    @Test
    fun `remote clock is never used to filter local edits`() = runTest {
        fixture { f ->
            f.accounts.edit { f.db.workDao().upsertWork(work(1)) }
            f.remote.onFetch = { Result.success(response(marker = "2099-01-01T00:00:00Z")) }
            assertIs<SyncResult.Success>(f.sync.sync())
            f.remote.sent.clear()
            f.works.updateWorkFavourite(1, true)
            assertIs<SyncResult.Success>(f.sync.sync())
            assertTrue(f.remote.sent.single().works.single().favourite)
        }
    }

    @Test
    fun `an older server tombstone cannot delete a newer local restore`() = runTest {
        fixture { f ->
            f.accounts.edit { f.db.workDao().upsertWork(work(1).copy(lastRead = 2_000_000_000_000)) }
            f.remote.onFetch = { Result.success(response(works = listOf(SyncWorkResponse(1, FIRST, deleted = true)))) }
            assertIs<SyncResult.Success>(f.sync.sync(forceFull = true))
            assertNotNull(f.db.workDao().getWorkById(1))
            assertFalse(f.remote.sent.single().works.single().deleted)
        }
    }

    @Test
    fun `an unknown work tombstone is retained as a parent for chapter rows`() = runTest {
        fixture { f ->
            f.remote.onFetch = { Result.success(response(
                works = listOf(SyncWorkResponse(1, FIRST, deleted = true)),
                chapters = listOf(SyncChapterResponse(1, 2, FIRST, readProgress = 1f))
            )) }
            assertIs<SyncResult.Success>(f.sync.sync(forceFull = true))
            assertNotNull(f.db.workDao().getWorkByIdIncludingDeleted(1)?.rowDeletedAt)
            assertNotNull(f.db.chapterDao().getChapterById(2, 1))
        }
    }

    @Test
    fun `remote metadata replaces tags even when the new tag set is empty`() = runTest {
        fixture { f ->
            f.accounts.edit {
                f.db.workDao().upsertWork(work(1))
                f.db.tagDao().upsertTag(TagEntity(1, "Removed", "", 4, 100))
            }
            f.remote.onFetch = { Result.success(response(
                works = listOf(SyncWorkResponse(1, FIRST)),
                metadata = listOf(SyncWorkMetadata(1, "Title", "Author", language = "English", wordCount = 100, currentChapters = 1, hits = 0, kudos = 0, bookmarks = 0, comments = 0, published = FIRST, lastUpdated = FIRST))
            )) }
            assertIs<SyncResult.Success>(f.sync.sync())
            assertTrue(f.db.tagDao().getTagsByWorkOnce(1).isEmpty())
        }
    }

    @Test
    fun `same account reactivation invalidates an earlier sync generation`() = runTest {
        fixture { f ->
            f.remote.onFetch = {
                f.accounts.activate("production:a")
                Result.success(response(works = listOf(SyncWorkResponse(99, FIRST))))
            }
            assertIs<SyncResult.NotAuthenticated>(f.sync.sync())
            assertNull(f.db.workDao().getWorkById(99))
        }
    }

    @Test
    fun `a late sign in cannot replace a more recent sign in`() = runTest {
        fixture { f ->
            val settings = AppSettings(null)
            val tokens = MemoryTokens()
            val service = FakeAuthService(settings)
            val auth = AuthRepository(service, tokens, f.accounts, settings)
            val started = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            service.onSignIn = { email, _ ->
                if (email == "a") { started.complete(Unit); release.await() }
                Result.success(SignInResponse("token-$email", user(email)))
            }
            try {
                val old = async { auth.signIn("a", "password") }
                started.await()
                auth.signIn("b", "password")
                release.complete(Unit)
                old.await()
                assertEquals("b", (auth.authState.value as AuthState.Authenticated).user?.id)
                assertEquals("token-b", tokens.value)
                assertEquals("PRODUCTION:b", f.accounts.active.value?.owner)
            } finally { service.getClient().close() }
        }
    }

    @Test
    fun `changing environment rejects the old endpoint sign in result`() = runTest {
        fixture { f ->
            val settings = AppSettings(null)
            val tokens = MemoryTokens()
            val service = FakeAuthService(settings)
            val auth = AuthRepository(service, tokens, f.accounts, settings)
            val started = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            service.onSignIn = { _, endpoint ->
                assertEquals(ApiEnvironment.PRODUCTION.authBaseUrl, endpoint)
                started.complete(Unit)
                release.await()
                Result.success(SignInResponse("old-token", user("a")))
            }
            try {
                val old = async { auth.signIn("a", "password") }
                started.await()
                settings.setApiEnvironment(ApiEnvironment.DEV)
                release.complete(Unit)
                old.await()
                assertNull(tokens.value)
                assertFalse(auth.authState.value is AuthState.Authenticated)
                assertNotEquals("DEV:a", f.accounts.active.value?.owner)
            } finally { service.getClient().close() }
        }
    }

    @Test
    fun `late sign out response cannot clear a newer session`() = runTest {
        fixture { f ->
            val settings = AppSettings(null)
            val tokens = MemoryTokens()
            val service = FakeAuthService(settings)
            val auth = AuthRepository(service, tokens, f.accounts, settings)
            val started = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            service.onSignOut = {
                started.complete(Unit)
                release.await()
                Result.success(Unit)
            }
            try {
                auth.signIn("a", "password")
                val old = async { auth.signOut() }
                started.await()
                auth.signIn("b", "password")
                release.complete(Unit)
                old.await()
                assertEquals("token-b", tokens.value)
                assertEquals("b", (auth.authState.value as AuthState.Authenticated).user?.id)
            } finally { service.getClient().close() }
        }
    }

    @Test
    fun `v6 migration retains rows and starts with a fresh owner and remote cursor`() = runTest {
        val directory = Files.createTempDirectory("ao3tracker-migration-")
        val file = directory.resolve("test.db")
        val schema = Json.parseToJsonElement(Files.readString(Path.of("schemas/com.qcksys.ao3tracker.data.database.Ao3Database/6.json"))).jsonObject["database"]!!.jsonObject
        BundledSQLiteDriver().open(file.toString()).use { connection ->
            schema["entities"]!!.jsonArray.forEach { entry ->
                val entity = entry.jsonObject
                val table = entity["tableName"]!!.jsonPrimitive.content
                connection.execSQL(entity["createSql"]!!.jsonPrimitive.content.replace("\${TABLE_NAME}", table))
                entity["indices"]!!.jsonArray.forEach {
                    connection.execSQL(it.jsonObject["createSql"]!!.jsonPrimitive.content.replace("\${TABLE_NAME}", table))
                }
            }
            schema["setupQueries"]!!.jsonArray.forEach { connection.execSQL(it.jsonPrimitive.content) }
            connection.execSQL("PRAGMA user_version = 6")
            connection.execSQL("INSERT INTO works(id,isPrivate,subscribed,favourite,lastRead,rowCreatedAt,rowUpdatedAt) VALUES (1,0,0,0,100,100,100)")
        }
        val accounts = createTestAccounts(directory)
        try {
            assertNull(accounts.initialize().remoteCursor)
            accounts.activate("PRODUCTION:a", claimLegacy = true)
            assertNotNull(accounts.database.workDao().getWorkById(1))
            assertNull(accounts.active.value?.remoteCursor)
        } finally {
            accounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private suspend fun fixture(block: suspend (Fixture) -> Unit) {
        val directory = Files.createTempDirectory("ao3tracker-test-")
        val accounts = createTestAccounts(directory)
        try {
            val f = Fixture(accounts)
            f.accounts.initialize()
            f.accounts.activate("production:a")
            block(f)
        } finally {
            accounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private class Fixture(val accounts: AccountDataStore) {
        val db get() = accounts.database
        val auth = FakeAuth()
        val remote = FakeRemote()
        val works = Ao3Repository(accounts)
        val favourites = FavouriteTagRepository(accounts)
        val searches = SavedSearchRepository(accounts)
        val sync = SyncRepository(remote, auth, favourites, searches, accounts)
    }

    private class FakeAuth : SyncAuthentication {
        var owner = "production:a"
        override val authState = MutableStateFlow<AuthState>(AuthState.Authenticated(null, "token"))
        override fun currentOwner() = owner
        override fun isCurrentSession(token: String, owner: String) = token == "token" && this.owner == owner
        override suspend fun invalidateSession() { authState.value = AuthState.Idle }
    }

    private class FakeRemote : SyncRemote {
        val sent = mutableListOf<SyncPostRequest>()
        var onFetch: suspend (Long?) -> Result<SyncGetResponse> = { Result.success(response()) }
        var onSend: suspend (SyncPostRequest) -> Result<SyncPostResponse> = { Result.success(accepted()) }
        override suspend fun fetchSyncData(token: String, lastSyncedAt: String?, workCursor: Long?, limit: Int?) = onFetch(workCursor)
        override suspend fun sendSyncData(token: String, request: SyncPostRequest): Result<SyncPostResponse> {
            sent.add(request)
            return onSend(request)
        }
    }

    private class MemoryTokens : SessionTokenStorage {
        var value: String? = null
        override fun getToken() = value
        override fun saveToken(token: String) { value = token }
        override fun clearToken() { value = null }
    }

    private class FakeAuthService(settings: AppSettings) : AuthService(settings) {
        var onSignIn: suspend (String, String) -> Result<SignInResponse> = { email, _ -> Result.success(SignInResponse("token-$email", user(email))) }
        var onSignOut: suspend () -> Result<Unit> = { Result.success(Unit) }
        override suspend fun signIn(email: String, password: String, baseUrl: String) = onSignIn(email, baseUrl)
        override suspend fun signOut(token: String, baseUrl: String) = onSignOut()
    }

    companion object {
        private const val FIRST = "2026-01-01T00:00:00Z"
        private const val SECOND = "2026-01-01T00:00:01Z"
        private fun work(id: Long) = WorkEntity(id = id, lastRead = 100, rowCreatedAt = 100, rowUpdatedAt = 100)
        private fun chapter() = ChapterEntity(workId = 1, chapterId = 2, readProgress = 1f, lastReadAt = 100, markedCompleteAt = 100, rowCreatedAt = 100, rowUpdatedAt = 100)
        private fun search(id: String) = SavedSearchEntity(id, "Name", "https://archiveofourown.org/works", false, 100, true)
        private fun accepted() = SyncPostResponse(emptyList(), emptyList(), FIRST)
        private fun user(id: String) = User(id, id, "$id@example.com", true, createdAt = FIRST, updatedAt = FIRST)
        private fun response(
            marker: String = FIRST,
            works: List<SyncWorkResponse> = emptyList(),
            chapters: List<SyncChapterResponse> = emptyList(),
            metadata: List<SyncWorkMetadata> = emptyList(),
            more: Boolean = false,
            cursor: Long? = null
        ) = SyncGetResponse(works, chapters, workMetadata = metadata, serverLastUpdated = marker, hasMore = more, nextWorkCursor = cursor)
    }
}
