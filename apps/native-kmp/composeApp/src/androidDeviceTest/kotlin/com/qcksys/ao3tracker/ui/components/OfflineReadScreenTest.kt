package com.qcksys.ao3tracker.ui.components

import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import cafe.adriel.voyager.core.annotation.InternalVoyagerApi
import cafe.adriel.voyager.core.model.ScreenModelStore
import cafe.adriel.voyager.navigator.tab.TabNavigator
import com.qcksys.ao3tracker.OfflineReaderTestActivity
import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.database.*
import com.qcksys.ao3tracker.data.model.*
import com.qcksys.ao3tracker.data.offline.*
import com.qcksys.ao3tracker.data.repository.*
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.sync.*
import com.qcksys.ao3tracker.ui.navigation.ReadNavigation
import com.qcksys.ao3tracker.ui.navigation.ReadTab
import com.qcksys.ao3tracker.ui.screens.read.ReadScreen
import com.qcksys.ao3tracker.ui.screens.read.ReadScreenModel
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test
import org.junit.runner.RunWith
import org.koin.compose.KoinIsolatedContext
import org.koin.dsl.koinApplication
import org.koin.dsl.module
import kotlin.test.*

@OptIn(InternalVoyagerApi::class)
@RunWith(AndroidJUnit4::class)
class OfflineReadScreenTest {
    @Test
    fun nativeChapterControlsNavigateSavedPagesAndKeepASkinnedChapterOpenWhenTheNextIsMissing() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val directory = File(context.noBackupFilesDir, "offline-ui-test-${UUID.randomUUID()}").apply { mkdirs() }
        val open = { name: String -> Room.databaseBuilder<Ao3Database>(context, File(directory, name).absolutePath)
            .setDriver(BundledSQLiteDriver()).setQueryCoroutineContext(Dispatchers.IO).build() }
        val accounts = AccountDataStore(open("test.db"), open)
        val store = OfflineContentStore(accounts, DiskOfflineFiles(File(directory, "files")))
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val settings = AppSettings(null)
        val holder = directory.name
        val model = runBlocking(Dispatchers.Main) {
            accounts.initialize()
            val selected = store.observeIdentity("user:fixture")
            val chapters = (1..3).map { OfflineChapter((it * 11).toString(), it, "Chapter $it", url(it * 11)) }
            for (chapter in chapters.take(2)) {
                val styles = listOf(OfflineStyle("body{background:rgb(35,25,45);color:rgb(235,220,245)} .actions{display:none}", url(11), "all", false))
                val page = OfflinePage(1, chapter.url, "1", chapter.id, "chapter", "Saved story", "user:fixture", true,
                    "<html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body><div id=\"chapters\"><div class=\"userstuff\">Saved chapter ${chapter.number}</div></div><ul class=\"actions\"><li>Hidden AO3 controls</li></ul></body></html>", styles, chapters)
                store.beginCapture(selected).publish(OfflineBundle(page, offlineSkinHash(styles), emptyList(), emptyList()), true, true)
            }
            accounts.edit { accounts.database.workDao().upsertWork(WorkEntity(1, title = "Current library title", currentChapters = 3, rowCreatedAt = 1, rowUpdatedAt = 1)) }
            val coordinator = OfflineCoordinator(store, accounts, settings, Ao3RequestGate(), MutableStateFlow(OfflineNetwork(false, false)), true, scope)
            val auth = object : SyncAuthentication {
                override val authState = MutableStateFlow<AuthState>(AuthState.Idle)
                override fun currentOwner(): String? = null
                override fun isCurrentSession(token: String, owner: String) = false
                override suspend fun invalidateSession() = Unit
            }
            val remote = object : SyncRemote {
                override suspend fun fetchSyncData(token: String, lastSyncedAt: String?, workCursor: Long?, limit: Int?): Result<SyncGetResponse> = error("Offline screen must not fetch sync")
                override suspend fun sendSyncData(token: String, request: SyncPostRequest): Result<SyncPostResponse> = error("Offline screen must not send sync")
            }
            val searches = SavedSearchRepository(accounts)
            val sync = SyncCoordinator(SyncRepository(remote, auth, FavouriteTagRepository(accounts), searches, accounts), auth, accounts, {}, scope)
            val reader = ScreenModelStore.getOrPut(holder, null) { ReadScreenModel(Ao3Repository(accounts), searches, SyncTriggers(sync), accounts, settings, coordinator) }
            reader.navigateToReadingPosition(ReadNavigation(url(11), 0f))
            reader to coordinator
        }
        val testKoin = koinApplication { modules(module {
            single { model.first }; single { model.second }; single { settings }
        }) }
        try {
            ActivityScenario.launch(OfflineReaderTestActivity::class.java).use { scenario ->
                scenario.onActivity { activity -> activity.setContent {
                    KoinIsolatedContext(context = testKoin) { MaterialTheme { TabNavigator(ReadTab) { ReadScreen() } } }
                } }
                await { evaluate(scenario, "document.querySelector('.userstuff')?.textContent") == "Saved chapter 1" }
                assertEquals("rgb(35, 25, 45)", evaluate(scenario, "getComputedStyle(document.body).backgroundColor"))
                await { clickText("Next") }
                await { evaluate(scenario, "document.querySelector('.userstuff')?.textContent") == "Saved chapter 2" }
                assertEquals(url(22), model.first.currentUrl.value)
                assertEquals("rgb(35, 25, 45)", evaluate(scenario, "getComputedStyle(document.body).backgroundColor"))
                await { clickText("Next") }
                await { nodes().any { it.text?.toString() == "Chapter not saved" } }
                assertEquals(url(22), model.first.currentUrl.value)
                assertEquals("Current library title", runBlocking { accounts.database.workDao().getWorkById(1)?.title })
                assertNull(runBlocking { accounts.database.chapterDao().getChapterById(33, 1) })
                assertNull(runBlocking { accounts.database.chapterDao().getChapterById(22, 1)?.markedCompleteAt })
                await { clickText("Stay here") }
                assertEquals("Saved chapter 2", evaluate(scenario, "document.querySelector('.userstuff')?.textContent"))
                runBlocking {
                    accounts.edit {
                        val work = assertNotNull(accounts.database.workDao().getWorkById(1))
                        accounts.database.workDao().upsertWork(work.copy(currentChapters = 4))
                    }
                }
                await { clickText("Offline") }
                await { nodes().any { it.text?.toString() == "2 of 4 published chapters saved" } }
                assertTrue(nodes().any { it.text?.toString() == "New chapters are available. Update saved work to download them." })
                await { clickText("Done") }
                runBlocking(Dispatchers.Main) {
                    model.first.openSavedOrLive("https://archiveofourown.org/works/1?view_full_work=true#chapter-2")
                }
                await { nodes().any { it.text?.toString() == "Read saved chapters" } }
                assertEquals(url(22), model.first.currentUrl.value)
                assertTrue(nodes().any { it.text?.toString() == "Open saved chapter 2" })
                assertNull(runBlocking { accounts.database.chapterDao().getChapterById(22, 1)?.markedCompleteAt })
                await { clickText("Open saved chapter 1") }
                await { evaluate(scenario, "document.querySelector('.userstuff')?.textContent") == "Saved chapter 1" }
                assertEquals(url(11), model.first.currentUrl.value)
                repeat(5) { iteration ->
                    if (iteration > 0) {
                        val previousSession = model.first.liveReaderSession.value
                        runBlocking { store.observeIdentity("user:fixture") }
                        await { model.first.liveReaderSession.value != previousSession }
                        runBlocking(Dispatchers.Main) {
                            model.first.navigateToReadingPosition(ReadNavigation(url(11), 0f))
                        }
                        await { evaluate(scenario, "document.querySelector('.userstuff')?.textContent") == "Saved chapter 1" }
                    }
                    var previousView: WebView? = null
                    scenario.onActivity { previousView = findWebView(it.findViewById(android.R.id.content)) }
                    runBlocking { store.observeIdentity("guest") }
                    await { model.first.currentUrl.value == "https://archiveofourown.org" && model.first.savedChapter.value == null }
                    await {
                        var replaced = false
                        scenario.onActivity { replaced = findWebView(it.findViewById(android.R.id.content)) !== previousView }
                        replaced
                    }
                    assertFalse(model.first.canGoBack.value)
                }
            }
        } finally {
            testKoin.close()
            runBlocking(Dispatchers.Main) { ScreenModelStore.onDisposeNavigator(holder) }
            scope.cancel()
            accounts.close()
            directory.deleteRecursively()
        }
    }

    private fun clickText(text: String): Boolean {
        return nodes().filter { it.text?.toString() == text }.any { node ->
            var target: AccessibilityNodeInfo? = node
            while (target != null && !target.isClickable) target = target.parent
            target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
        }
    }

    private fun nodes(): List<AccessibilityNodeInfo> {
        val root = InstrumentationRegistry.getInstrumentation().uiAutomation.rootInActiveWindow ?: return emptyList()
        val result = mutableListOf<AccessibilityNodeInfo>()
        fun visit(node: AccessibilityNodeInfo) {
            result.add(node)
            for (index in 0 until node.childCount) node.getChild(index)?.let(::visit)
        }
        visit(root)
        return result
    }

    private fun await(condition: () -> Boolean) {
        val end = System.nanoTime() + TimeUnit.SECONDS.toNanos(15)
        while (System.nanoTime() < end) {
            if (condition()) return
            Thread.sleep(100)
        }
        fail("The offline reader did not reach the expected state. Visible text: ${nodes().mapNotNull { it.text }.joinToString()}")
    }

    private fun evaluate(scenario: ActivityScenario<OfflineReaderTestActivity>, script: String): String? {
        val done = CountDownLatch(1)
        val value = AtomicReference<String?>()
        scenario.onActivity { activity ->
            val view = findWebView(activity.findViewById(android.R.id.content))
            if (view == null) done.countDown() else view.evaluateJavascript(script) {
                value.set(runCatching { Json.parseToJsonElement(it).jsonPrimitive.content }.getOrNull())
                done.countDown()
            }
        }
        assertTrue(done.await(5, TimeUnit.SECONDS))
        return value.get()
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findWebView(view.getChildAt(index))?.let { return it }
        return null
    }

    private fun url(chapter: Int) = "https://archiveofourown.org/works/1/chapters/$chapter"
}
