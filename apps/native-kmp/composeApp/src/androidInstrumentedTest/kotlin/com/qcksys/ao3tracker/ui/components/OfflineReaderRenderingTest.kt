package com.qcksys.ao3tracker.ui.components

import android.graphics.Bitmap
import android.app.UiModeManager
import android.content.Context
import android.content.pm.ActivityInfo
import android.os.ParcelFileDescriptor
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.qcksys.ao3tracker.OfflineReaderTestActivity
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.Ao3Database
import com.qcksys.ao3tracker.data.offline.DiskOfflineFiles
import com.qcksys.ao3tracker.data.offline.OfflineContentStore
import com.qcksys.ao3tracker.data.offline.OfflinePageObservation
import com.qcksys.ao3tracker.data.offline.parseOfflineObservation
import com.qcksys.ao3tracker.webview.OfflineObservationScriptGenerated
import com.qcksys.ao3tracker.webview.guardAo3Script
import com.qcksys.ao3tracker.data.offline.OfflineChapter
import com.qcksys.ao3tracker.data.offline.OfflineAssetClient
import com.qcksys.ao3tracker.data.offline.OfflineBundle
import com.qcksys.ao3tracker.data.offline.OfflineCaptureRequest
import com.qcksys.ao3tracker.data.offline.OfflineHttpResult
import com.qcksys.ao3tracker.data.offline.OfflinePage
import com.qcksys.ao3tracker.data.offline.OfflineReaderDocument
import com.qcksys.ao3tracker.data.offline.OfflineReaderEvent
import com.qcksys.ao3tracker.data.offline.OfflineResource
import com.qcksys.ao3tracker.data.offline.OfflineStyle
import com.qcksys.ao3tracker.data.offline.offlineResourceHash
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.ByteArrayInputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
class OfflineReaderRenderingTest {
    @Test
    fun wholeWorkDiscoveryNavigatesBeforeCapturingAnIndividualChapter() {
        val workUrl = "https://archiveofourown.org/works/123"
        val chapterUrl = "$workUrl/chapters/456"
        val first = """<div class="chapter" id="chapter-1"><div class="chapter preface group">
            <h3 class="title"><a href="$chapterUrl">Chapter 1</a></h3></div>
            <div class="userstuff module" role="article"><p>First chapter only.</p></div></div>"""
        val second = """<div class="chapter" id="chapter-2"><div class="chapter preface group">
            <h3 class="title"><a href="$workUrl/chapters/789">Chapter 2</a></h3></div>
            <div class="userstuff module" role="article"><p>Second chapter must not be saved yet.</p></div></div>"""
        fun html(chapters: String) = """<!doctype html><html><head></head><body class="logged-out">
            <select id="selected_id"><option value="456" selected>1. First</option><option value="789">2. Second</option></select>
            <div id="workskin"><h2 class="title heading">Discovery fixture</h2><div id="chapters">$chapters</div></div></body></html>"""
        for (discoveryUrl in listOf(workUrl, "$workUrl?view_full_work=false")) {
            val completed = CountDownLatch(1)
            val result = AtomicReference<OfflineBundle>()
            val failure = AtomicReference<String>()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
            val connection = AtomicReference<OfflineCaptureConnection>()
            val liveView = AtomicReference<WebView>()
            ActivityScenario.launch(OfflineReaderTestActivity::class.java).use { scenario ->
                try {
                    scenario.onActivity { activity ->
                        val view = Ao3PageWebView(activity)
                        liveView.set(view)
                        view.settings.javaScriptEnabled = true
                        val assets = OfflineAssetClient({ null }) { _, _, _ -> OfflineHttpResult(404) }
                        val bridge = OfflineCaptureConnection(view, scope, assets)
                        connection.set(bridge)
                        view.webViewClient = object : WebViewClient() {
                            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse {
                                val content = if (request?.url?.toString() == chapterUrl) first else first + second
                                return WebResourceResponse("text/html", "UTF-8", ByteArrayInputStream(html(content).encodeToByteArray()))
                            }
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) { bridge.cancel() }
                            override fun onPageFinished(view: WebView?, loadedUrl: String?) {
                                if (loadedUrl == null || view?.url != loadedUrl) return
                                val request = OfflineCaptureRequest(loadedUrl, "guest", { true },
                                    stageResource = { _, _ -> error("The discovery fixture has no resources") },
                                    publish = { result.set(it); completed.countDown() },
                                    onFailure = { message, _ -> failure.set(message); completed.countDown() })
                                bridge.start(request, discoverChapter = true)
                            }
                        }
                        activity.setContentView(view)
                        view.loadUrl(discoveryUrl)
                    }
                    assertTrue(completed.await(20, TimeUnit.SECONDS), "Chapter discovery timed out")
                    assertEquals(null, failure.get())
                    val saved = assertNotNull(result.get()).page
                    assertEquals(chapterUrl, saved.url)
                    assertEquals("456", saved.chapterId)
                    assertEquals("chapter", saved.representation)
                    assertEquals(listOf("456", "789"), saved.chapters.map { it.id })
                    assertTrue(saved.html.contains("First chapter only."))
                    assertTrue(!saved.html.contains("Second chapter must not be saved yet."))
                } finally {
                    scenario.onActivity { connection.get()?.close(); liveView.get()?.destroy() }
                    scope.cancel()
                }
            }
        }
    }

    @Test
    fun changingSystemAppearanceAndRotationKeepsTheSavedPageAndPositionWithoutReadingProgress() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val manager = instrumentation.targetContext.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        val originalMode = manager.nightMode
        fun setNight(mode: String) {
            ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand("cmd uimode night $mode")).use { it.readBytes() }
        }
        val url = "https://archiveofourown.org/works/123/chapters/456"
        val styles = listOf(OfflineStyle("""
            body{background:rgb(245,240,235);color:rgb(25,20,15)} #chapters{height:30000px}
            @media(prefers-color-scheme:dark){body{background:rgb(35,25,45);color:rgb(235,220,245)} #chapters{height:35000px}}
            @media(orientation:landscape){#chapters{padding-left:17px}}
            @media(orientation:portrait){#chapters{padding-left:11px}}
        """.trimIndent(), url, "all", false))
        val page = OfflinePage(1, url, "123", "456", "chapter", "Responsive saved skin", "guest", true,
            "<html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><div id=\"chapters\">Saved responsive chapter</div></body></html>",
            styles, listOf(OfflineChapter("456", 1, "One", url)))
        val ready = CountDownLatch(1)
        val progress = AtomicInteger()
        val failures = AtomicInteger()
        val document = OfflineReaderDocument(page, emptyList(), scrollPercentage = 42f, isCurrent = { true }, readResource = { null })
        try {
            setNight("no")
            ActivityScenario.launch(OfflineReaderTestActivity::class.java).use { scenario ->
                val originalView = AtomicReference<WebView>()
                scenario.onActivity { activity ->
                    activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    activity.setContent {
                        OfflineAo3WebView(document, Modifier.fillMaxSize(),
                            onEvent = { if (it == OfflineReaderEvent.Ready) ready.countDown() else progress.incrementAndGet() },
                            onFailure = { failures.incrementAndGet() })
                    }
                }
                assertTrue(ready.await(20, TimeUnit.SECONDS))
                scenario.onActivity { originalView.set(findWebView(it.findViewById(android.R.id.content))) }
                fun value(script: String) = Json.parseToJsonElement(evaluate(scenario, script)).jsonPrimitive.content
                val position = "(()=>{const r=document.getElementById('chapters').getBoundingClientRect();return (innerHeight-r.top)/r.height*100})()"
                assertEquals("rgb(245, 240, 235)", value("getComputedStyle(document.body).backgroundColor"))
                evaluate(scenario, "document.dispatchEvent(new Event('pointerdown')); true")
                setNight("yes")
                await { value("matchMedia('(prefers-color-scheme: dark)').matches") == "true" }
                await { value(position).toDouble() in 41.9..42.1 }
                assertEquals("rgb(35, 25, 45)", value("getComputedStyle(document.body).backgroundColor"))
                scenario.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
                await { value("matchMedia('(orientation: landscape)').matches") == "true" }
                await { value(position).toDouble() in 41.9..42.1 }
                assertEquals("17px", value("getComputedStyle(document.getElementById('chapters')).paddingLeft"))
                setNight("no")
                await { value("getComputedStyle(document.body).backgroundColor") == "rgb(245, 240, 235)" }
                await { value(position).toDouble() in 41.9..42.1 }
                scenario.onActivity { assertTrue(originalView.get() === findWebView(it.findViewById(android.R.id.content))) }
                assertEquals(0, progress.get())
                assertEquals(0, failures.get())
            }
        } finally {
            document.close()
            setNight(when (originalMode) { UiModeManager.MODE_NIGHT_YES -> "yes"; UiModeManager.MODE_NIGHT_NO -> "no"; else -> "auto" })
        }
    }

    @Test
    fun capturesAnAuthenticatedInheritedSkinAndMatchesItsLiveAppearanceAfterReopen() = compareLiveAndSavedSkin(replacement = false)

    @Test
    fun capturesAReplacementSkinWithoutAddingDefaultStylesAndMatchesItsLiveAppearanceAfterReopen() = compareLiveAndSavedSkin(replacement = true)

    @Test
    fun ao3DefaultMatchesItsSavedAppearanceAfterReopen() = compareLiveAndSavedSkin(upstream = "default")

    @Test
    fun ao3ReversiMatchesItsSavedAppearanceAfterReopen() = compareLiveAndSavedSkin(upstream = "reversi")

    private fun compareLiveAndSavedSkin(replacement: Boolean = false, upstream: String? = null) {
        val url = "https://archiveofourown.org/works/123"
        val css = "body{background:rgb(35,25,45);color:rgb(235,220,245)} #workskin{max-width:45em;margin:auto}"
        val sheets = mutableMapOf("/skin.css" to css)
        val parents = if (replacement) "" else {
            sheets["/parents/type.css"] = "body{background:white;color:black;font:19px/1.6 Georgia,serif} .userstuff p{font-style:italic}"
            sheets["/parents/layout.css"] = "#outer{padding:12px} #workskin{max-width:60em} @media(max-width:42em){#chapters{margin-left:7px}}"
            """<link rel="stylesheet" href="/parents/type.css"><link rel="stylesheet" href="/parents/layout.css">"""
        }
        val head = if (upstream == null) "$parents<link rel=\"stylesheet\" href=\"/skin.css\"><style media=\"screen\">#chapters{border-top:2px solid rgb(140,90,150)}</style>" else {
            sheets.clear()
            val assets = InstrumentationRegistry.getInstrumentation().context.assets
            assets.list("ao3-skins")!!.filter { it.endsWith(".css.txt") && (upstream == "reversi" || !it.startsWith("reversi")) }.sorted().joinToString("") { name ->
                val path = "/stylesheets/${name.removeSuffix(".txt")}"
                sheets[path] = assets.open("ao3-skins/$name").bufferedReader().use { it.readText() }
                val media = when {
                    name.startsWith("25-") -> "only screen and (max-width:62em)"
                    name.startsWith("26-") -> "only screen and (max-width:42em)"
                    name.startsWith("27-") -> "speech"
                    name.startsWith("28-") -> "print"
                    else -> "screen"
                }
                "<link rel=\"stylesheet\" href=\"$path\" media=\"$media\">"
            }
        }
        val html = """<html lang="en"><head><meta name="viewport" content="width=device-width">$head<meta name="csrf-token" content="secret"></head>
            <body class="logged-in"><nav id="greeting"><a href="/users/fixture">Hi, fixture!</a></nav><div id="outer" class="wrapper"><div id="inner" class="wrapper"><div id="main" class="works-show region"><div id="workskin">
            <h2 class="title heading">Captured story</h2><div id="chapters"><div class="userstuff"><p>Story captured through the Android bridge. 📚</p></div></div>
            </div></div></div></div><form><input name="authenticity_token" value="secret"><input type="text" value="private draft"></form></body></html>""".trimIndent()
        val appearanceScript = """JSON.stringify([
            getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color,
            getComputedStyle(document.body).fontFamily, getComputedStyle(document.body).fontSize, getComputedStyle(document.body).lineHeight,
            getComputedStyle(document.getElementById('outer')).paddingLeft, getComputedStyle(document.getElementById('workskin')).maxWidth,
            getComputedStyle(document.getElementById('chapters')).marginLeft, getComputedStyle(document.getElementById('chapters')).borderTopColor,
            getComputedStyle(document.querySelector('.userstuff p')).fontStyle, document.getElementById('chapters').getBoundingClientRect().width
        ])"""
        val liveAppearance = AtomicReference<String>()
        val resources = ConcurrentHashMap<String, ByteArray>()
        val result = AtomicReference<OfflineBundle>()
        val observed = AtomicReference<OfflinePageObservation>()
        val failure = AtomicReference<String>()
        val completed = CountDownLatch(1)
        val ready = CountDownLatch(1)
        val captureScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val connection = AtomicReference<OfflineCaptureConnection>()
        val liveView = AtomicReference<WebView>()
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(appContext.noBackupFilesDir, "offline-test-${UUID.randomUUID()}").apply { mkdirs() }
        val disk = DiskOfflineFiles(File(directory, "files"))
        fun openAccounts(): AccountDataStore {
            val open = { name: String -> Room.databaseBuilder<Ao3Database>(appContext, File(directory, name).absolutePath)
                .setDriver(BundledSQLiteDriver()).setQueryCoroutineContext(Dispatchers.IO).build() }
            return AccountDataStore(open("test.db"), open)
        }
        var accounts = openAccounts()
        var store = OfflineContentStore(accounts, disk)
        val capture = runBlocking { store.beginCapture(store.observeIdentity("user:fixture")) }
        ActivityScenario.launch(OfflineReaderTestActivity::class.java).use { scenario ->
            try {
                scenario.onActivity { activity ->
                    val view = Ao3PageWebView(activity)
                    liveView.set(view)
                    view.settings.javaScriptEnabled = true
                    view.settings.useWideViewPort = true
                    view.settings.loadWithOverviewMode = true
                    val assets = OfflineAssetClient({ "session=fixture" }) { requested, cookie, _ ->
                        assertEquals("session=fixture", cookie)
                        val sheet = sheets[android.net.Uri.parse(requested).path]
                        if (sheet != null) OfflineHttpResult(200, "text/css", sheet.encodeToByteArray()) else OfflineHttpResult(404)
                    }
                    val bridge = OfflineCaptureConnection(view, captureScope, assets)
                    connection.set(bridge)
                    val request = OfflineCaptureRequest(url, "user:fixture", { true },
                        stageResource = { resource, bytes -> capture.stage(resource, bytes); resources[resource.hash] = bytes },
                        publish = { capture.publish(it, foreground = true, pin = true); result.set(it); completed.countDown() },
                        onFailure = { message, _ -> failure.set(message); completed.countDown() })
                    view.webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse {
                            val stylesheet = sheets[request?.url?.path]
                            return WebResourceResponse(if (stylesheet != null) "text/css" else "text/html", "UTF-8", ByteArrayInputStream((stylesheet ?: html).encodeToByteArray()))
                        }
                        override fun onPageFinished(view: WebView?, loadedUrl: String?) {
                            view?.evaluateJavascript(guardAo3Script("${OfflineObservationScriptGenerated.script}; return Ao3OfflineObservation.observe(document, location.href);")) { body ->
                                observed.set(parseOfflineObservation(body, url))
                            }
                            view?.evaluateJavascript(appearanceScript) { values -> liveAppearance.set(values); bridge.start(request) }
                        }
                    }
                    activity.setContentView(view)
                    view.loadUrl(url)
                }
                assertTrue(completed.await(20, TimeUnit.SECONDS), "Capture timed out")
                assertEquals(null, failure.get())
                assertEquals(OfflinePageObservation(url, "user:fixture", true), observed.get())
                val bundle = assertNotNull(result.get())
                assertEquals("user:fixture", bundle.page.ao3Identity)
                assertEquals("Captured story", bundle.page.title)
                assertTrue(bundle.page.html.contains("📚"))
                assertTrue(!bundle.page.html.contains("secret") && !bundle.page.html.contains("private draft"))
                assertEquals(sheets.size, resources.size)
                accounts.close()
                accounts = openAccounts()
                store = OfflineContentStore(accounts, disk)
                val document = runBlocking { assertNotNull(store.open(assertNotNull(store.initialize()), url)).document }
                scenario.onActivity { activity ->
                    connection.get().close()
                    liveView.get().destroy()
                    activity.setContent {
                        OfflineAo3WebView(document, Modifier.fillMaxSize(),
                            onEvent = { if (it == OfflineReaderEvent.Ready) ready.countDown() },
                            onFailure = { failure.set("Local render failed") })
                    }
                }
                assertTrue(ready.await(20, TimeUnit.SECONDS), "Captured chapter did not reopen")
                assertEquals(null, failure.get())
                val background = evaluate(scenario, "getComputedStyle(document.body).backgroundColor")
                if (upstream == null) assertEquals("rgb(35, 25, 45)", Json.parseToJsonElement(background).jsonPrimitive.content)
                if (upstream != null) assertEquals(sheets.size, bundle.page.siteStyles.size)
                assertEquals(liveAppearance.get(), evaluate(scenario, appearanceScript), "Saved styling must match the foreground AO3 fixture")
                document.close()
            } finally {
                scenario.onActivity { connection.get()?.close() }
                captureScope.cancel()
                accounts.close()
                directory.deleteRecursively()
            }
        }
    }

    @Test
    fun savedSkinLoadsImportsAndMediaRulesWithAnIsolatedBridge() {
        val parent = "body{background:rgb(24,24,28);color:rgb(230,230,235);font:20px Georgia,serif;margin:24px} #outer{max-width:800px;margin:auto}"
        val parentBytes = parent.encodeToByteArray()
        val parentHash = offlineResourceHash("text/css", parentBytes)
        val child = "@import url('/resources/$parentHash'); #chapters{color:rgb(200,210,220)} @media(max-width:600px){#chapters{padding:11px}} @media(min-width:601px){#chapters{padding:17px}}"
        val childBytes = child.encodeToByteArray()
        val childHash = offlineResourceHash("text/css", childBytes)
        val assets = mapOf(parentHash to parentBytes, childHash to childBytes)
        val url = "https://archiveofourown.org/works/123/chapters/456"
        val page = OfflinePage(1, url, "123", "456", "chapter", "Offline skin fixture", "user:fixture", true,
            """<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
                <body class="logged-in"><div id="outer"><h1>Offline skin fixture</h1><div id="workskin"><h2 class="title heading">A saved chapter</h2>
                <div id="chapters"><div class="userstuff"><p>The inherited site skin controls the background, type, and spacing.</p>
                <p>These styles and this chapter are served from local resources.</p><a href="/works/123/chapters/789">Next chapter</a></div></div></div></div>
                <script>window.savedPageScriptRan = true;</script></body></html>""".trimIndent(),
            listOf(OfflineStyle("@import url('/resources/$childHash');", url, "all", false)),
            listOf(OfflineChapter("456", 1, "Chapter 1", url)))
        val ready = CountDownLatch(1)
        val unexpected = AtomicInteger()
        val failures = AtomicInteger()
        val document = OfflineReaderDocument(page, assets.map { OfflineResource(it.key, "text/css", it.value.size.toLong()) },
            isCurrent = { true }, readResource = { assets[it] })
        ActivityScenario.launch(OfflineReaderTestActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                activity.setContent {
                    OfflineAo3WebView(document, Modifier.fillMaxSize(),
                        onEvent = { if (it == OfflineReaderEvent.Ready) ready.countDown() else unexpected.incrementAndGet() },
                        onFailure = { failures.incrementAndGet() })
                }
            }
            assertTrue(ready.await(20, TimeUnit.SECONDS), "The saved reader never became ready")
            assertEquals(0, failures.get())
            val values = evaluate(scenario, """JSON.stringify([
                getComputedStyle(document.body).backgroundColor,
                getComputedStyle(document.getElementById('chapters')).color,
                getComputedStyle(document.getElementById('chapters')).paddingTop,
                matchMedia('(max-width:600px)').matches ? '11px' : '17px',
                window.savedPageScriptRan === true,
                typeof window.AndroidBridge,
                location.protocol
            ])""")
            val decoded = Json.parseToJsonElement(Json.parseToJsonElement(values).jsonPrimitive.content).jsonArray.map { it.jsonPrimitive.content }
            assertEquals(listOf("rgb(24, 24, 28)", "rgb(200, 210, 220)"), decoded.take(2))
            assertEquals(decoded[3], decoded[2])
            assertEquals(listOf("false", "undefined", "https:"), decoded.takeLast(3))
            evaluate(scenario, "OfflineBridge.postMessage(JSON.stringify({type:'offlineProgress',token:'old',scrollPercentage:100})); true")
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            assertEquals(0, unexpected.get())
            val bitmap = assertNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot())
            val folder = InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null)
            File(folder, "offline-reader-fixture.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            document.close()
        }
    }

    private fun evaluate(scenario: ActivityScenario<OfflineReaderTestActivity>, script: String): String {
        val result = AtomicReference<String>()
        val done = CountDownLatch(1)
        scenario.onActivity { activity ->
            val webView = assertNotNull(findWebView(activity.findViewById(android.R.id.content)))
            webView.evaluateJavascript(script) { result.set(it); done.countDown() }
        }
        assertTrue(done.await(5, TimeUnit.SECONDS), "The reader did not respond")
        return result.get()
    }

    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15)
        while (System.nanoTime() < deadline) {
            if (condition()) return
            Thread.sleep(100)
        }
        throw AssertionError("The saved skin did not update after the configuration change")
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findWebView(view.getChildAt(index))?.let { return it }
        return null
    }
}
