package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.offline.*
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlin.test.*

class OfflineStorageTest {
    @Test
    fun `storage failure during an explicit refresh preserves the pinned chapter and selected skin`() = runTest {
        fixture { accounts, disk ->
            val original = bundle()
            val store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            save(store, context, original, pin = true)
            val keys = disk.keys(context.files).toSet()
            var writes = 0
            val full = object : OfflineFiles by disk {
                override fun put(scope: OfflineFileScope, key: String, bytes: ByteArray) {
                    if (++writes == 2) throw OfflineStorageUnavailable()
                    disk.put(scope, key, bytes)
                }
            }
            val updateStore = OfflineContentStore(accounts, full)
            val restored = assertNotNull(updateStore.initialize())
            val styles = listOf(OfflineStyle("body{color:blue}", original.page.url, "all", false))
            val updated = original.copy(page = original.page.copy(html = original.page.html.replace("Saved", "Edited"), siteStyles = styles), skinHash = offlineSkinHash(styles))
            val capture = updateStore.beginCapture(restored)
            try { assertFailsWith<OfflineStorageUnavailable> { capture.publish(updated, true, pin = true) } }
            finally { capture.cancel() }
            assertEquals(original.skinHash, accounts.database.offlineDao().selectedContext()?.activeSkin)
            assertTrue(updateStore.statuses(restored).single().work.pinned)
            val reopened = assertNotNull(updateStore.open(restored, original.page.url))
            assertEquals(original.page.html, reopened.document.page.html)
            reopened.document.close()
            updateStore.collectUnusedFiles()
            assertEquals(keys, disk.keys(context.files).toSet())
        }
    }

    @Test
    fun `saved reading refreshes old text in the background without replacing the open copy or losing new chapter coverage`() = runTest {
        fixture { accounts, disk ->
            var time = 1000L
            val store = OfflineContentStore(accounts, disk, now = { time })
            val context = store.observeIdentity("user:fixture")
            val first = bundle()
            save(store, context, first)
            store.enqueuePrefetch(context, first.page, refreshCurrent = true)
            assertFalse(first.page.url in offlineJson.decodeFromString<List<String>>(store.nextJob(context)!!.remainingJson))
            val opened = assertNotNull(store.open(context, first.page.url))
            time += 30 * 60 * 1000L
            store.enqueuePrefetch(context, first.page, refreshCurrent = true)
            val job = assertNotNull(store.nextJob(context))
            assertEquals(listOf(first.page.url) + first.page.chapters.drop(1).take(2).map { it.url }, offlineJson.decodeFromString<List<String>>(job.remainingJson))
            store.setJobState(context, job.id, "running")
            val updated = first.copy(page = first.page.copy(html = first.page.html.replace("Saved", "Edited"),
                chapters = first.page.chapters + OfflineChapter("460", 5, "New", "https://archiveofourown.org/works/123/chapters/460")))
            store.beginCapture(context).publish(updated, false, jobId = job.id, automatic = true)
            assertEquals(first.page.html, opened.document.page.html)
            val reopened = assertNotNull(store.open(context, first.page.url))
            assertEquals(updated.page.html, reopened.document.page.html)
            assertEquals(5, store.statuses(context).single().publishedChapters)
            accounts.edit {
                accounts.database.workDao().upsertWork(com.qcksys.ao3tracker.data.database.WorkEntity(123, currentChapters = 6, rowCreatedAt = 1, rowUpdatedAt = 1))
            }
            val status = store.statuses(context).single()
            assertEquals(6, status.publishedChapters)
            assertEquals(5, status.chapters.size)
            assertEquals(setOf("456"), status.savedChapterIds)
            opened.document.close()
            reopened.document.close()
        }
    }

    @Test
    fun `whole work skin-only capture stays within the automatic allowance`() = runTest {
        fixture { accounts, disk ->
            val store = OfflineContentStore(accounts, disk, automaticAllowance = 1)
            val context = store.observeIdentity("user:fixture")
            val original = bundle()
            val whole = original.copy(page = original.page.copy(url = "https://archiveofourown.org/works/123?view_full_work=true", representation = "whole"))
            val capture = store.beginCapture(context)
            try { assertFailsWith<OfflineAllowanceExceeded> { capture.publish(whole, true, automatic = true) } }
            finally { capture.cancel() }
            store.collectUnusedFiles()
            assertNull(accounts.database.offlineDao().selectedContext()!!.activeSkin)
            assertTrue(store.statuses(context).isEmpty())
            assertEquals(0, store.storageUsage().automaticBytes)
            assertTrue(disk.keys(context.files).isEmpty())
        }
    }

    @Test
    fun `cancellation while staging a new chapter cannot evict an earlier saved chapter`() = runTest {
        fixture { accounts, disk ->
            var store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            val first = bundle()
            save(store, context, first)
            val allowance = store.storageUsage().automaticBytes
            var allowed = true
            val cancelOnWrite = object : OfflineFiles by disk {
                override fun put(scope: OfflineFileScope, key: String, bytes: ByteArray) {
                    disk.put(scope, key, bytes)
                    allowed = false
                }
            }
            store = OfflineContentStore(accounts, cancelOnWrite, automaticAllowance = allowance)
            val restored = assertNotNull(store.initialize())
            val next = first.copy(page = first.page.copy(chapterId = "457", url = first.page.chapters[1].url))
            val capture = store.beginCapture(restored) { allowed }
            try { assertFailsWith<CancellationException> { capture.publish(next, true, automatic = true) } }
            finally { capture.cancel() }
            store.collectUnusedFiles()
            assertNotNull(store.open(restored, first.page.url)).document.close()
            assertNull(store.open(restored, next.page.url))
        }
    }

    @Test
    fun `a new account evicts the oldest automatic chapter from another account without changing library clocks`() = runTest {
        fixture { accounts, disk ->
            accounts.activate("production:first")
            var store = OfflineContentStore(accounts, disk)
            val first = store.observeIdentity("user:fixture")
            save(store, first, bundle())
            val initialSize = store.storageUsage().automaticBytes
            val firstDatabase = accounts.database
            val chapterBytes = firstDatabase.offlineDao().chapters(first.id).single().bytes
            accounts.activate("production:second")
            store = OfflineContentStore(accounts, disk, automaticAllowance = initialSize * 2 - chapterBytes)
            val second = store.observeIdentity("user:fixture")
            val revision = accounts.localRevision
            save(store, second, bundle())
            assertTrue(firstDatabase.offlineDao().chapters(first.id).isEmpty())
            assertNotNull(store.open(second, bundle().page.url)).document.close()
            assertEquals(revision, accounts.localRevision)
            assertTrue(store.storageUsage().automaticBytes <= store.automaticAllowance)
            store.collectUnusedFiles()
            assertTrue(disk.keys(first.files).size < disk.keys(second.files).size)
        }
    }

    @Test
    fun `a rejected refresh retains the previous chapter and theme`() = runTest {
        fixture { accounts, disk ->
            var store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            val original = bundle()
            save(store, context, original)
            val allowance = store.storageUsage().automaticBytes
            store = OfflineContentStore(accounts, disk, automaticAllowance = allowance)
            val restored = assertNotNull(store.initialize())
            val oversized = original.copy(page = original.page.copy(html = original.page.html + "large".repeat(1000)))
            val capture = store.beginCapture(restored)
            try { assertFailsWith<OfflineAllowanceExceeded> { capture.publish(oversized, true, automatic = true) } }
            finally { capture.cancel() }
            store.collectUnusedFiles()
            val saved = assertNotNull(store.open(restored, original.page.url))
            assertEquals(original.page.html, saved.document.page.html)
            saved.document.close()
            assertEquals(allowance, store.storageUsage().automaticBytes)
        }
    }

    @Test
    fun `clearing automatic content preserves pinned works in all accounts and an open document remains readable`() = runTest {
        fixture { accounts, disk ->
            val store = OfflineContentStore(accounts, disk)
            val first = store.observeIdentity("user:fixture")
            save(store, first, bundle(100), pin = true)
            save(store, first, bundle(200))
            accounts.activate("production:second")
            val second = store.observeIdentity("user:fixture")
            save(store, second, bundle(300), pin = true)
            save(store, second, bundle(400))
            val opened = assertNotNull(store.open(second, bundle(400).page.url))
            val revision = accounts.localRevision
            store.clearAutomatic()
            assertTrue(opened.document.isActive())
            assertEquals(bundle(400).page.html, opened.document.page.html)
            assertNull(store.open(second, bundle(400).page.url))
            assertNotNull(store.open(second, bundle(300).page.url)).document.close()
            opened.document.close()
            store.collectUnusedFiles()
            assertEquals(0, store.storageUsage().automaticBytes)
            assertTrue(store.storageUsage().pinnedBytes > 0)
            assertEquals(revision, accounts.localRevision)
            accounts.activate(first.owner)
            val restored = assertNotNull(store.initialize())
            assertNotNull(store.open(restored, bundle(100).page.url)).document.close()
            assertNull(store.open(restored, bundle(200).page.url))
        }
    }

    @Test
    fun `prefetch targets only the next two chapters and manual jobs retain priority`() = runTest {
        fixture { accounts, disk ->
            val store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            val first = bundle()
            save(store, context, first)
            store.enqueueWork(context, 123)
            store.enqueuePrefetch(context, first.page)
            assertEquals("save-discover", store.nextJob(context)?.mode)
            assertEquals("save-discover", store.statuses(context).single().job?.mode)
            val prefetch = accounts.database.offlineDao().jobs(context.id).single { it.mode == "prefetch" }
            assertEquals(first.page.chapters.drop(1).take(2).map { it.url }, offlineJson.decodeFromString<List<String>>(prefetch.remainingJson))
            store.enqueuePrefetch(context, first.page.copy(chapterId = "458", url = first.page.chapters[2].url))
            val moved = accounts.database.offlineDao().jobs(context.id).single { it.mode == "prefetch" }
            assertEquals(listOf(first.page.chapters.last().url), offlineJson.decodeFromString<List<String>>(moved.remainingJson))
        }
    }

    @Test
    fun `retries stop after three failures respect the shared cooldown and manual retry resets them`() = runTest {
        fixture { accounts, disk ->
            var time = 1000L
            val store = OfflineContentStore(accounts, disk, now = { time })
            val context = store.observeIdentity("user:fixture")
            store.enqueueWork(context, 123)
            val job = assertNotNull(store.nextJob(context))
            assertEquals(20_000, store.failJob(context, job.id, "Rate limited", 20_000))
            assertNull(store.nextJob(context))
            time = 20_000
            assertEquals(job.id, store.nextJob(context)?.id)
            assertEquals(50_000, store.failJob(context, job.id, "Unavailable", 0))
            time = 50_000
            assertNotNull(store.nextJob(context))
            assertNull(store.failJob(context, job.id, "Unavailable", 0))
            assertNull(store.nextJob(context))
            assertEquals("failed", store.statuses(context).single().job?.state)
            store.retryWork(context, 123)
            assertEquals(0, store.nextJob(context)?.attempts)
        }
    }

    private suspend fun save(store: OfflineContentStore, context: OfflineContext, bundle: OfflineBundle, pin: Boolean = false) {
        store.releaseReaderProtection()
        store.beginCapture(context).publish(bundle, foreground = true, pin = pin, automatic = !pin)
    }

    private fun bundle(workId: Long = 123): OfflineBundle {
        val chapters = (456..459).mapIndexed { index, id -> OfflineChapter("$id", index + 1, "Chapter ${index + 1}", "https://archiveofourown.org/works/$workId/chapters/$id") }
        val page = OfflinePage(1, chapters.first().url, "$workId", "456", "chapter", "Work $workId", "user:fixture", true,
            "<html><head></head><body><div id=\"chapters\">Saved $workId</div></body></html>", emptyList(), chapters)
        return OfflineBundle(page, offlineSkinHash(emptyList()), emptyList(), emptyList())
    }

    private suspend fun fixture(block: suspend (AccountDataStore, DiskOfflineFiles) -> Unit) {
        val directory = Files.createTempDirectory("offline-storage-")
        val accounts = createTestAccounts(directory)
        try { block(accounts, DiskOfflineFiles(directory.resolve("files").toFile())) }
        finally {
            accounts.close()
            Files.walk(directory).use { it.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }
}
