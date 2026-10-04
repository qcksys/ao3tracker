package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.offline.*
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.OfflinePreferences
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlin.test.*

class OfflineCoordinatorTest {
    @Test
    fun `discovery follows the first chapter then downloads each remaining chapter without changing reading progress`() = runBlocking {
        fixture { coordinator, _ ->
            coordinator.setForeground(true)
            coordinator.saveWork(123)
            val discovery = withTimeout(5000) { coordinator.background.first { it != null }!! }
            assertEquals("https://archiveofourown.org/works/123", discovery.url)
            coordinator.downloadNavigation(discovery.id, url)
            val first = assertNotNull(coordinator.background.value)
            assertEquals(discovery.id, first.id)
            assertEquals(url, first.capture.url)
            assertTrue(first.capture.isCurrent())
            first.capture.publish(multiChapterBundle())
            var previous = first.id
            for (chapter in multiChapterBundle().page.chapters.drop(1)) {
                val next = withTimeout(5000) { coordinator.background.first { it != null && it.id != previous }!! }
                assertEquals(chapter.url, next.url)
                next.capture.publish(multiChapterBundle().let { it.copy(page = it.page.copy(url = chapter.url, chapterId = chapter.id)) })
                previous = next.id
            }
            val completed = withTimeout(5000) { coordinator.downloads.first { it.singleOrNull()?.job?.state == "complete" }.single() }
            assertEquals(setOf("456", "457", "458", "459"), completed.savedChapterIds)
            assertNotNull(coordinator.open(url)).document.close()
        }
    }

    @Test
    fun `download service continues the queue after app backgrounds and service stop preserves resumable work`() = runBlocking {
        fixture { coordinator, _ ->
            coordinator.setForeground(true)
            coordinator.setDownloadServiceActive(true)
            coordinator.saveWork(123)
            val first = withTimeout(5000) { coordinator.background.first { it != null }!! }
            coordinator.setForeground(false)
            assertTrue(first.capture.isCurrent())
            first.capture.publish(multiChapterBundle())
            val next = withTimeout(5000) { coordinator.background.first { it != null && it.id != first.id }!! }
            assertTrue(next.capture.isCurrent())
            coordinator.setDownloadServiceActive(false)
            assertFalse(next.capture.isCurrent())
            withTimeout(5000) { coordinator.background.first { it == null } }
            coordinator.setForeground(true)
            val resumed = withTimeout(5000) { coordinator.background.first { it != null }!! }
            assertEquals(next.url, resumed.url)
            assertTrue(coordinator.debugEntries.value.any { it.message.contains("Chapter saved") })
        }
    }

    @Test
    fun `default settings do not capture live pages or queue saved chapter refresh and prefetch`() = runBlocking {
        fixture { coordinator, _ ->
            coordinator.setForeground(true)
            coordinator.liveNavigation(url)
            val event = OfflinePageObservation(url, "user:fixture", true)
            coordinator.observed(event)
            withTimeout(5000) { coordinator.page.first { it == event } }
            coordinator.readingSaved(multiChapterBundle().page) { true }.join()
            assertNull(coordinator.capture.value)
            assertNull(coordinator.background.value)
            assertTrue(coordinator.downloads.value.isEmpty())
            assertNull(coordinator.store.nextJob(coordinator.store.context.value!!))
        }
    }

    @Test
    fun `storage failures pause the queue immediately with an actionable bounded message`() = runBlocking {
        fixture { coordinator, _ ->
            coordinator.setForeground(true)
            coordinator.saveWork(123)
            val request = withTimeout(5000) { coordinator.background.first { it != null }!! }
            request.capture.onFailure(offlineCaptureFailure(OfflineStorageUnavailable()), null)
            val stopped = withTimeout(5000) { coordinator.downloads.first { it.singleOrNull()?.job?.state == "failed" }.single().job!! }
            assertEquals(0, stopped.retryAt)
            assertEquals(1, stopped.attempts)
            assertTrue(stopped.error.orEmpty().contains("space"))
            assertFalse(offlineCaptureFailure(IllegalStateException("private chapter text")).contains("private"))
            assertTrue(offlineCaptureFailure(OfflineAllowanceExceeded()).contains("allowance"))
        }
    }

    @Test
    fun `saving a whole work page captures its skin then discovers individual chapters without claiming full coverage`() = runBlocking {
        val settings = AppSettings(null)
        settings.setOfflinePreferences(OfflinePreferences(automatic = false))
        fixture(settings) { coordinator, _ ->
            val wholeUrl = "https://archiveofourown.org/works/123?view_full_work=true"
            coordinator.setForeground(true)
            coordinator.liveNavigation(wholeUrl)
            val event = OfflinePageObservation(wholeUrl, "user:fixture", true)
            coordinator.observed(event)
            withTimeout(5000) { coordinator.page.first { it == event } }
            coordinator.saveWork(123)
            val capture = withTimeout(5000) { coordinator.capture.first { it != null }!! }
            val whole = multiChapterBundle().let { it.copy(page = it.page.copy(url = wholeUrl, representation = "whole")) }
            capture.publish(whole)
            val discovery = withTimeout(5000) { coordinator.background.first { it != null }!! }
            assertEquals("https://archiveofourown.org/works/123", discovery.url)
            assertTrue(coordinator.downloads.value.all { it.savedChapterIds.isEmpty() })
            assertNull(coordinator.open(wholeUrl))
            assertNull(coordinator.open(url))
            discovery.capture.publish(multiChapterBundle())
            withTimeout(5000) { coordinator.downloads.first { it.singleOrNull()?.savedChapterIds == setOf("456") } }
            assertNotNull(coordinator.open(url)).document.close()
        }
    }

    @Test
    fun `manual queue pauses outside the foreground and resumes the same chapter without reading it`() = runBlocking {
        fixture { coordinator, _ ->
            coordinator.setForeground(true)
            coordinator.saveWork(123)
            val first = withTimeout(5000) { coordinator.background.first { it != null }!! }
            assertTrue(first.capture.isCurrent())
            coordinator.setForeground(false)
            assertFalse(first.capture.isCurrent())
            withTimeout(5000) { coordinator.background.first { it == null } }
            coordinator.setForeground(true)
            val resumed = withTimeout(5000) { coordinator.background.first { it != null && it.id != first.id }!! }
            assertEquals(first.url, resumed.url)
            resumed.capture.publish(bundle())
            withTimeout(5000) { coordinator.downloads.first { it.singleOrNull()?.job?.state == "complete" } }
            assertNotNull(coordinator.open(url)).document.close()
        }
    }

    @Test
    fun `a shared cooldown delays the hidden WebView and interactive navigation invalidates its capture immediately`() = runBlocking {
        fixture { coordinator, _ ->
            coordinator.setForeground(true)
            coordinator.gate.pause("1")
            coordinator.saveWork(123)
            delay(100)
            assertNull(coordinator.background.value)
            val request = withTimeout(5000) { coordinator.background.first { it != null }!! }
            coordinator.interactiveLoading(true)
            assertFalse(request.capture.isCurrent())
            withTimeout(5000) { coordinator.background.first { it == null } }
            coordinator.interactiveLoading(false)
            withTimeout(5000) { coordinator.background.first { it != null && it.id != request.id } }
        }
    }

    @Test
    fun `automatic foreground capture queues two chapters but prefetch waits for Wi-Fi`() = runBlocking {
        val settings = AppSettings(null)
        settings.setIncognitoModeEnabled(false)
        settings.setOfflinePreferences(OfflinePreferences(automatic = true))
        fixture(settings) { coordinator, network ->
            network.value = OfflineNetwork(true, false)
            coordinator.setForeground(true)
            coordinator.liveNavigation(url)
            coordinator.observed(OfflinePageObservation(url, "user:fixture", true))
            val current = withTimeout(5000) { coordinator.capture.first { it != null }!! }
            current.publish(multiChapterBundle())
            withTimeout(5000) { coordinator.downloads.first { it.singleOrNull()?.job?.mode == "prefetch" } }
            assertFalse(coordinator.downloads.value.single().work.pinned)
            delay(100)
            assertNull(coordinator.background.value)
            network.value = OfflineNetwork(true, true)
            val next = withTimeout(5000) { coordinator.background.first { it != null }!! }
            assertTrue(next.automatic)
            assertEquals(multiChapterBundle().page.chapters[1].url, next.url)
            settings.setIncognitoModeEnabled(true)
            assertFalse(next.capture.isCurrent())
            withTimeout(5000) { coordinator.background.first { it == null } }
        }
    }

    @Test
    fun `incognito cancels an automatic capture while an explicit mobile download remains allowed`() = runBlocking {
        val settings = AppSettings(null)
        settings.setIncognitoModeEnabled(false)
        settings.setOfflinePreferences(OfflinePreferences(automatic = true))
        fixture(settings) { coordinator, network ->
            coordinator.setForeground(true)
            coordinator.liveNavigation(url)
            coordinator.observed(OfflinePageObservation(url, "user:fixture", true))
            val automatic = withTimeout(5000) { coordinator.capture.first { it != null }!! }
            settings.setIncognitoModeEnabled(true)
            assertFalse(automatic.isCurrent())
            assertFailsWith<CancellationException> { automatic.publish(bundle()) }
            withTimeout(5000) { coordinator.capture.first { it == null } }
            network.value = OfflineNetwork(true, false)
            coordinator.leaveLivePage()
            coordinator.saveWork(123)
            val manual = withTimeout(5000) { coordinator.background.first { it != null }!! }
            assertFalse(manual.automatic)
            assertTrue(manual.capture.isCurrent())
            manual.capture.publish(bundle())
            withTimeout(5000) { coordinator.downloads.first { it.singleOrNull()?.job?.state == "complete" } }
            assertTrue(coordinator.downloads.value.single().work.pinned)
        }
    }

    @Test
    fun `duplicate page observations cannot cancel an explicit save`() = runBlocking {
        val settings = AppSettings(null)
        settings.setOfflinePreferences(OfflinePreferences(automatic = false))
        fixture(settings) { coordinator, _ ->
            coordinator.setForeground(true)
            coordinator.liveNavigation(url)
            val event = OfflinePageObservation(url, "user:fixture", true)
            coordinator.observed(event)
            withTimeout(5000) { coordinator.page.first { it == event } }
            coordinator.saveWork(123)
            val manual = withTimeout(5000) { coordinator.capture.first { it != null }!! }
            settings.setOfflinePreferences(OfflinePreferences(automatic = true))
            coordinator.observed(event)
            delay(100)
            assertSame(manual, coordinator.capture.value)
            assertTrue(manual.isCurrent())
        }
    }

    @Test
    fun `reconnection sync is debounced and respects foreground and the auto-sync preference`() = runBlocking {
        val settings = AppSettings(null)
        settings.setAutoSyncOnOpenEnabled(true)
        val syncs = AtomicInteger()
        fixture(settings, requestSync = { syncs.incrementAndGet() }) { coordinator, network ->
            coordinator.setForeground(true)
            delay(200)
            network.value = OfflineNetwork(false, false)
            delay(1100)
            assertEquals(0, syncs.get())
            network.value = OfflineNetwork(true, true)
            withTimeout(5000) { while (syncs.get() != 1) delay(10) }
            network.value = OfflineNetwork(true, false)
            delay(1100)
            assertEquals(1, syncs.get())
            coordinator.setForeground(false)
            network.value = OfflineNetwork(false, false)
            delay(100)
            network.value = OfflineNetwork(true, true)
            delay(1100)
            assertEquals(1, syncs.get())
            settings.setAutoSyncOnOpenEnabled(false)
            coordinator.setForeground(true)
            delay(1100)
            assertEquals(1, syncs.get())
        }
    }

    private suspend fun fixture(settings: AppSettings = AppSettings(null), requestSync: () -> Unit = {}, block: suspend (OfflineCoordinator, MutableStateFlow<OfflineNetwork>) -> Unit) {
        val directory = Files.createTempDirectory("offline-coordinator-")
        val accounts = createTestAccounts(directory)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            val store = OfflineContentStore(accounts, DiskOfflineFiles(directory.resolve("files").toFile()))
            store.observeIdentity("user:fixture")
            val network = MutableStateFlow(OfflineNetwork(true, true))
            val coordinator = OfflineCoordinator(store, accounts, settings, Ao3RequestGate(), network, true, scope, requestSync)
            block(coordinator, network)
            assertTrue(accounts.database.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
            assertTrue(accounts.database.workDao().getAllWorksIncludingDeletedOnce().isEmpty())
        } finally {
            scope.coroutineContext[Job]!!.cancelAndJoin()
            accounts.close()
            Files.walk(directory).use { it.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private fun bundle(): OfflineBundle {
        val page = OfflinePage(1, url, "123", "456", "chapter", "Saved", "user:fixture", true,
            "<html><head></head><body><div id=\"chapters\">Saved</div></body></html>", emptyList(), listOf(OfflineChapter("456", 1, "One", url)))
        return OfflineBundle(page, offlineSkinHash(emptyList()), emptyList(), emptyList())
    }

    private fun multiChapterBundle(): OfflineBundle {
        val first = bundle()
        val chapters = (456..459).mapIndexed { index, id -> OfflineChapter("$id", index + 1, "Chapter ${index + 1}", "https://archiveofourown.org/works/123/chapters/$id") }
        return first.copy(page = first.page.copy(chapters = chapters))
    }

    private val url = "https://archiveofourown.org/works/123/chapters/456"
}
