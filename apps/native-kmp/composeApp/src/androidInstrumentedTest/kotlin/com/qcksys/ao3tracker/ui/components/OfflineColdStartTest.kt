package com.qcksys.ao3tracker.ui.components

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.qcksys.ao3tracker.MainActivity
import com.qcksys.ao3tracker.data.auth.getTokenStorage
import com.qcksys.ao3tracker.data.auth.initializeTokenStorage
import com.qcksys.ao3tracker.data.database.*
import com.qcksys.ao3tracker.data.offline.*
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.getSettingsStorage
import com.qcksys.ao3tracker.push.Ao3FirebaseMessagingService
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.*

@RunWith(AndroidJUnit4::class)
class OfflineColdStartTest {
    @Test
    fun savedSkinAndPositionSurviveASeparateAppProcess() {
        val phase = InstrumentationRegistry.getArguments().getString("offlineColdStart")
        assumeTrue("Run prepare, force-stop the app, then run verify on the test emulator", phase in setOf("prepare", "verify"))
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        initializeTokenStorage(context)
        assertNull(getTokenStorage().getToken(), "Use the signed-out test emulator for this fixture")
        if (phase == "prepare") {
            runBlocking {
                val open = { name: String -> Room.databaseBuilder<Ao3Database>(context, context.getDatabasePath(name).absolutePath)
                    .setDriver(BundledSQLiteDriver()).setQueryCoroutineContext(Dispatchers.IO)
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6,
                        MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11).build() }
                val accounts = AccountDataStore(open(DB_FILE_NAME), open)
                try {
                    accounts.activate(AccountDataStore.GUEST)
                    val store = OfflineContentStore(accounts, getOfflineFiles())
                    val selected = store.observeIdentity("guest")
                    val styles = listOf(OfflineStyle("body{background:rgb(35,25,45);color:rgb(235,220,245)} #chapters{height:30000px}", url, "all", false))
                    val page = OfflinePage(1, url, "$workId", "$chapterId", "chapter", "Offline cold-start fixture", "guest", true,
                        "<html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body><div id=\"chapters\"><p id=\"cold-start\">Persisted offline chapter</p></div></body></html>",
                        styles, listOf(OfflineChapter("$chapterId", 1, "Chapter one", url)))
                    store.beginCapture(selected).publish(OfflineBundle(page, offlineSkinHash(styles), emptyList(), emptyList()), true, true)
                    accounts.edit {
                        accounts.database.workDao().upsertWork(WorkEntity(workId, title = page.title, currentChapters = 1, rowCreatedAt = 1, rowUpdatedAt = 1))
                        accounts.database.chapterDao().upsertChapter(ChapterEntity(workId, chapterId, 1, readProgress = .42f, lastReadAt = 1, rowCreatedAt = 1, rowUpdatedAt = 1))
                    }
                    AppSettings(getSettingsStorage()).setIncognitoModeEnabled(false)
                } finally { accounts.close() }
            }
            return
        }
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Ao3FirebaseMessagingService.ACTION_OPEN_WORK
            putExtra("workId", "$workId")
        }
        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            await { evaluate(scenario, "document.getElementById('cold-start')?.textContent") == "Persisted offline chapter" }
            assertEquals("rgb(35, 25, 45)", evaluate(scenario, "getComputedStyle(document.body).backgroundColor"))
            assertTrue(evaluate(scenario, "location.origin").orEmpty().contains("appassets.androidplatform.net"))
            await {
                val percentage = evaluate(scenario, "(()=>{const r=document.getElementById('chapters').getBoundingClientRect();return (innerHeight-r.top)/r.height*100})()")?.toDoubleOrNull()
                percentage != null && percentage in 41.9..42.1
            }
        }
    }

    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(25)
        while (System.nanoTime() < deadline) {
            if (condition()) return
            Thread.sleep(100)
        }
        fail("The app did not restore its saved chapter and reading position")
    }

    private fun evaluate(scenario: ActivityScenario<MainActivity>, script: String): String? {
        val latch = CountDownLatch(1)
        val result = AtomicReference<String?>()
        scenario.onActivity { activity ->
            val webView = findWebView(activity.findViewById(android.R.id.content))
            if (webView == null) latch.countDown() else webView.evaluateJavascript(script) {
                result.set(runCatching { Json.parseToJsonElement(it).jsonPrimitive.content }.getOrNull())
                latch.countDown()
            }
        }
        assertTrue(latch.await(5, TimeUnit.SECONDS))
        return result.get()
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findWebView(view.getChildAt(index))?.let { return it }
        return null
    }

    companion object {
        private const val workId = 9_000_000_001L
        private const val chapterId = 9_000_000_011L
        private const val url = "https://archiveofourown.org/works/9000000001/chapters/9000000011"
    }
}
