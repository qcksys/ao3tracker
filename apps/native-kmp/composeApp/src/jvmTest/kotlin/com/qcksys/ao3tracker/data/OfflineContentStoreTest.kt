package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.offline.*
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlin.test.*

class OfflineContentStoreTest {
    private val url = "https://archiveofourown.org/works/123/chapters/456"

    @Test
    fun `whole work jobs freeze discovery coverage and resume an interrupted chapter after restart`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-queue-")
        val disk = DiskOfflineFiles(directory.resolve("files").toFile())
        var accounts = createTestAccounts(directory)
        try {
            var store = OfflineContentStore(accounts, disk)
            var context = store.observeIdentity("user:fixture")
            store.enqueueWork(context, 123)
            val discovery = assertNotNull(store.nextJob(context))
            store.setJobState(context, discovery.id, "running")
            val (first, firstBytes) = bundle()
            store.beginCapture(context).apply { stage(first.resources.single(), firstBytes); publish(first, false, true, discovery.id) }
            val next = assertNotNull(store.nextJob(context))
            assertEquals("save", next.mode)
            assertEquals(listOf(first.page.chapters[1].url), offlineJson.decodeFromString<List<String>>(next.remainingJson))
            assertEquals(setOf("456"), store.statuses(context).single().savedChapterIds)
            store.setJobState(context, next.id, "running")
            accounts.close()
            accounts = createTestAccounts(directory)
            store = OfflineContentStore(accounts, disk)
            context = assertNotNull(store.initialize())
            val resumed = assertNotNull(store.nextJob(context))
            assertEquals(next.remainingJson, resumed.remainingJson)
            assertEquals("running", resumed.state)
            val (second, secondBytes) = bundle(chapterId = "789")
            val newChapter = OfflineChapter("900", 3, "Published during download", "https://archiveofourown.org/works/123/chapters/900")
            store.beginCapture(context).apply {
                stage(second.resources.single(), secondBytes)
                publish(second.copy(page = second.page.copy(chapters = second.page.chapters + newChapter)), false, true, resumed.id)
            }
            val completed = store.statuses(context).single()
            assertEquals("complete", completed.job?.state)
            assertEquals(listOf("456", "789"), completed.chapters.map { it.id })
            assertEquals(setOf("456", "789"), completed.savedChapterIds)
            assertTrue(accounts.database.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
            assertNull(store.nextJob(context))
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `removing a queued work rejects a late chapter commit and updating retries without losing saved text`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-queue-remove-")
        val accounts = createTestAccounts(directory)
        try {
            val store = OfflineContentStore(accounts, DiskOfflineFiles(directory.resolve("files").toFile()))
            val context = store.observeIdentity("user:fixture")
            val (saved, bytes) = bundle()
            store.beginCapture(context).apply { stage(saved.resources.single(), bytes); publish(saved, true, true) }
            store.enqueueWork(context, 123, update = true)
            val job = assertNotNull(store.nextJob(context))
            store.setJobState(context, job.id, "failed", "Interrupted", Long.MAX_VALUE)
            assertNotNull(store.open(context, url)).document.close()
            assertNull(store.nextJob(context))
            store.retryWork(context, 123)
            assertEquals(job.id, store.nextJob(context)?.id)
            store.setJobState(context, job.id, "running")
            val late = store.beginCapture(context)
            late.stage(saved.resources.single(), bytes)
            store.removeWork(context, 123)
            assertFailsWith<IllegalArgumentException> { late.publish(saved, false, true, job.id) }
            late.cancel()
            assertTrue(store.statuses(context).isEmpty())
            assertNull(store.open(context, url))
        } finally { accounts.close(); removeDirectory(directory) }
    }

    private fun bundle(colour: String = "red", chapterId: String = "456"): Pair<OfflineBundle, ByteArray> {
        val css = "body{color:$colour}"
        val bytes = css.encodeToByteArray()
        val resource = OfflineResource(offlineResourceHash("text/css", bytes), "text/css", bytes.size.toLong())
        val styles = listOf(OfflineStyle("@import url('/resources/${resource.hash}');", url, "all", false))
        val page = OfflinePage(1, "https://archiveofourown.org/works/123/chapters/$chapterId", "123", chapterId, "chapter", "Story", "user:fixture", true,
            "<html><head></head><body><div id=\"workskin\"><div id=\"chapters\">Saved text</div></div></body></html>", styles,
            listOf(OfflineChapter("456", 1, "One", url), OfflineChapter("789", 2, "Two", "https://archiveofourown.org/works/123/chapters/789")))
        return OfflineBundle(page, offlineSkinHash(styles), listOf(resource), emptyList()) to bytes
    }

    @Test
    fun `reopening the database offline restores the selected identity skin text and pin without changing library clocks`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-store-")
        val disk = DiskOfflineFiles(directory.resolve("files").toFile())
        var accounts = createTestAccounts(directory)
        try {
            accounts.initialize()
            var store = OfflineContentStore(accounts, disk, { 1234 })
            val context = store.observeIdentity("user:fixture")
            val revision = accounts.localRevision
            val (bundle, bytes) = bundle()
            val capture = store.beginCapture(context)
            capture.stage(bundle.resources.single(), bytes)
            capture.publish(bundle, foreground = true, pin = true)
            assertEquals(revision, accounts.localRevision)
            assertTrue(accounts.database.workDao().getAllWorksIncludingDeletedOnce().isEmpty())
            accounts.close()
            accounts = createTestAccounts(directory)
            store = OfflineContentStore(accounts, disk)
            val restored = assertNotNull(store.initialize())
            assertEquals(context.id, restored.id)
            assertEquals(context.identity, restored.identity)
            val opened = assertNotNull(store.open(restored, url, 42f))
            assertEquals(1234, opened.savedAt)
            assertTrue(opened.document.readPath(opened.document.path)!!.bytes.decodeToString().contains("Saved text"))
            assertTrue(accounts.database.offlineDao().work(restored.id, 123)!!.pinned)
            opened.document.close()
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `a complete foreground skin refresh changes old downloads on next open and keeps the already open revision`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-skin-")
        val accounts = createTestAccounts(directory)
        try {
            val store = OfflineContentStore(accounts, DiskOfflineFiles(directory.resolve("files").toFile()))
            val context = store.observeIdentity("user:fixture")
            val (old, oldBytes) = bundle()
            store.beginCapture(context).apply { stage(old.resources.single(), oldBytes); publish(old, true) }
            val before = assertNotNull(store.open(context, url))
            val snapshot = accounts.database.offlineDao().chapter(context.id, chapterKey(url, "456"))!!
            val (fresh, freshBytes) = bundle("blue", "789")
            store.beginCapture(context).apply { stage(fresh.resources.single(), freshBytes); publish(fresh, true) }
            val after = assertNotNull(store.open(context, url))
            assertEquals(snapshot.fileHash, accounts.database.offlineDao().chapter(context.id, snapshot.key)!!.fileHash)
            assertTrue(before.document.readPath(before.document.path)!!.bytes.decodeToString().contains(old.resources.single().hash))
            assertTrue(after.document.readPath(after.document.path)!!.bytes.decodeToString().contains(fresh.resources.single().hash))
            assertEquals("body{color:blue}", after.document.readPath("/resources/${fresh.resources.single().hash}")!!.bytes.decodeToString())
            before.document.close(); after.document.close()
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `whole work foreground capture selects its skin without replacing chapter text or promising unavailable chapters`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-whole-")
        val accounts = createTestAccounts(directory)
        try {
            val store = OfflineContentStore(accounts, DiskOfflineFiles(directory.resolve("files").toFile()))
            val context = store.observeIdentity("user:fixture")
            val (original, originalBytes) = bundle()
            store.beginCapture(context).apply { stage(original.resources.single(), originalBytes); publish(original, true, pin = true) }
            val before = accounts.database.offlineDao().chapters(context.id)
            val (theme, themeBytes) = bundle("blue")
            val wholeUrl = "https://archiveofourown.org/works/123?view_full_work=true"
            val whole = theme.copy(page = theme.page.copy(url = wholeUrl, representation = "whole", html = "<html><head></head><body>Whole work text</body></html>"))
            store.beginCapture(context).apply { stage(whole.resources.single(), themeBytes); publish(whole, true, automatic = true) }
            assertEquals(before, accounts.database.offlineDao().chapters(context.id))
            assertEquals(whole.skinHash, accounts.database.offlineDao().selectedContext()!!.activeSkin)
            assertEquals(setOf("456"), store.statuses(context).single().savedChapterIds)
            assertNull(store.open(context, wholeUrl))
            val saved = assertNotNull(store.open(context, url))
            assertEquals(original.page.html, saved.document.page.html)
            assertTrue(saved.document.readPath(saved.document.path)!!.bytes.decodeToString().contains(whole.resources.single().hash))
            saved.document.close()
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `an interrupted or corrupt refresh cannot replace the last complete skin and snapshot`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-failure-")
        val accounts = createTestAccounts(directory)
        val disk = DiskOfflineFiles(directory.resolve("files").toFile())
        try {
            val store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            val (old, oldBytes) = bundle()
            store.beginCapture(context).apply { stage(old.resources.single(), oldBytes); publish(old, true) }
            val (fresh, freshBytes) = bundle("blue")
            val capture = store.beginCapture(context)
            capture.stage(fresh.resources.single(), freshBytes)
            disk.remove(context.files, fresh.resources.single().hash)
            assertFailsWith<IllegalArgumentException> { capture.publish(fresh, true) }
            capture.cancel()
            assertEquals(old.skinHash, accounts.database.offlineDao().selectedContext()!!.activeSkin)
            val opened = assertNotNull(store.open(context, url))
            assertTrue(opened.document.readPath(opened.document.path)!!.bytes.decodeToString().contains(old.resources.single().hash))
            opened.document.close()
            store.collectUnusedFiles()
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `background capture does not select its skin and a damaged active skin falls back to the chapters own skin`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-background-")
        val accounts = createTestAccounts(directory)
        val disk = DiskOfflineFiles(directory.resolve("files").toFile())
        try {
            val store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            val (old, oldBytes) = bundle()
            store.beginCapture(context).apply { stage(old.resources.single(), oldBytes); publish(old, true) }
            val (fresh, freshBytes) = bundle("blue", "789")
            store.beginCapture(context).apply { stage(fresh.resources.single(), freshBytes); publish(fresh, false) }
            assertEquals(old.skinHash, accounts.database.offlineDao().selectedContext()!!.activeSkin)
            disk.remove(context.files, old.resources.single().hash)
            val opened = assertNotNull(store.open(context, fresh.page.url))
            assertTrue(opened.document.readPath(opened.document.path)!!.bytes.decodeToString().contains(fresh.resources.single().hash))
            opened.document.close()
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `AO3 identity and tracker account changes invalidate open documents and reject late capture writes`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-accounts-")
        val accounts = createTestAccounts(directory)
        try {
            val store = OfflineContentStore(accounts, DiskOfflineFiles(directory.resolve("files").toFile()))
            val context = store.observeIdentity("user:fixture")
            val (bundle, bytes) = bundle()
            store.beginCapture(context).apply { stage(bundle.resources.single(), bytes); publish(bundle, true) }
            val opened = assertNotNull(store.open(context, url))
            val late = store.beginCapture(context)
            late.stage(bundle.resources.single(), bytes)
            val guest = store.observeIdentity("guest")
            assertFalse(opened.document.isActive())
            assertNull(store.open(guest, url))
            assertFailsWith<CancellationException> { late.publish(bundle, true) }
            late.cancel()
            opened.document.close()
            val previousIdentity = store.observeIdentity("user:fixture")
            assertEquals(context.id, previousIdentity.id)
            assertFalse(store.isCurrent(context))
            val reopened = assertNotNull(store.open(previousIdentity, url))
            accounts.activate("production:another-reader")
            assertFalse(reopened.document.isActive())
            assertNull(store.initialize())
            assertNull(store.open(store.observeIdentity("user:fixture"), url))
            reopened.document.close()
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `incognito cancellation rejects a staged capture and recovery removes its orphan files`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-cancel-")
        val accounts = createTestAccounts(directory)
        val disk = DiskOfflineFiles(directory.resolve("files").toFile())
        try {
            val store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            var allowed = true
            val (bundle, bytes) = bundle()
            val capture = store.beginCapture(context) { allowed }
            capture.stage(bundle.resources.single(), bytes)
            allowed = false
            assertFailsWith<CancellationException> { capture.publish(bundle, true) }
            capture.cancel()
            store.collectUnusedFiles()
            assertTrue(disk.keys(context.files).isEmpty())
            assertNull(store.open(context, url))
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `removal retains files used by an open chapter until it closes and keeps the active site skin`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-remove-")
        val accounts = createTestAccounts(directory)
        val disk = DiskOfflineFiles(directory.resolve("files").toFile())
        try {
            val store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            val (bundle, bytes) = bundle()
            store.beginCapture(context).apply { stage(bundle.resources.single(), bytes); publish(bundle, true) }
            val opened = assertNotNull(store.open(context, url))
            val chapterFile = accounts.database.offlineDao().chapter(context.id, chapterKey(url, "456"))!!.fileHash
            store.removeWork(context, 123)
            assertNull(store.open(context, url))
            assertTrue(chapterFile in disk.keys(context.files))
            assertNotNull(opened.document.readPath("/resources/${bundle.resources.single().hash}"))
            opened.document.close()
            store.collectUnusedFiles()
            assertFalse(chapterFile in disk.keys(context.files))
            assertTrue(bundle.resources.single().hash in disk.keys(context.files))
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `disk storage refuses traversal and oversized reads`() {
        val directory = Files.createTempDirectory("ao3-offline-paths-")
        try {
            val disk = DiskOfflineFiles(directory.toFile())
            val scope = OfflineFileScope("a".repeat(64), "00000000-0000-0000-0000-000000000000")
            assertFailsWith<IllegalArgumentException> { disk.put(scope, "../outside", byteArrayOf(1)) }
            assertFailsWith<IllegalArgumentException> { disk.removeContext(scope.copy(context = "../..")) }
            disk.put(scope, "b".repeat(64), byteArrayOf(1, 2, 3))
            assertNull(disk.read(scope, "b".repeat(64), 2))
            assertContentEquals(byteArrayOf(1, 2, 3), disk.read(scope, "b".repeat(64), 3))
        } finally { removeDirectory(directory) }
    }

    @Test
    fun `clear rollback preserves downloads while committed clear invalidates documents and removes only its files`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-clear-")
        val disk = DiskOfflineFiles(directory.resolve("files").toFile())
        val accounts = createTestAccounts(directory, removeOfflineContext = { owner, context ->
            disk.removeContext(OfflineFileScope(offlineSha256(owner.encodeToByteArray()), context))
        })
        try {
            val store = OfflineContentStore(accounts, disk)
            val context = store.observeIdentity("user:fixture")
            val (bundle, bytes) = bundle()
            store.beginCapture(context).apply { stage(bundle.resources.single(), bytes); publish(bundle, true) }
            val opened = assertNotNull(store.open(context, url))
            assertFailsWith<IllegalStateException> {
                accounts.edit { accounts.clearAccount(); error("Simulated transaction failure") }
            }
            assertTrue(opened.document.isActive())
            assertTrue(disk.keys(context.files).isNotEmpty())
            assertTrue(accounts.database.offlineDao().pendingCleanup().isEmpty())
            val late = store.beginCapture(context)
            late.stage(bundle.resources.single(), bytes)
            accounts.edit { accounts.clearAccount() }
            assertFalse(opened.document.isActive())
            assertTrue(disk.keys(context.files).isEmpty())
            assertTrue(accounts.database.offlineDao().contexts().isEmpty())
            assertFailsWith<CancellationException> { late.publish(bundle, true) }
            late.cancel()
            opened.document.close()
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `failed file cleanup is durable and retries on startup without deleting a replacement context`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-cleanup-")
        val disk = DiskOfflineFiles(directory.resolve("files").toFile())
        var accounts = createTestAccounts(directory, removeOfflineContext = { _, _ -> throw java.io.IOException("Busy file") })
        try {
            var store = OfflineContentStore(accounts, disk)
            val old = store.observeIdentity("user:fixture")
            val (bundle, bytes) = bundle()
            store.beginCapture(old).apply { stage(bundle.resources.single(), bytes); publish(bundle, true) }
            accounts.edit { accounts.clearAccount() }
            assertEquals(1, accounts.database.offlineDao().pendingCleanup().size)
            val replacement = store.observeIdentity("user:fixture")
            assertNotEquals(old.id, replacement.id)
            store.beginCapture(replacement).apply { stage(bundle.resources.single(), bytes); publish(bundle, true) }
            accounts.close()
            accounts = createTestAccounts(directory, removeOfflineContext = { owner, context ->
                disk.removeContext(OfflineFileScope(offlineSha256(owner.encodeToByteArray()), context))
            })
            store = OfflineContentStore(accounts, disk)
            val restored = assertNotNull(store.initialize())
            assertEquals(replacement.id, restored.id)
            assertTrue(disk.keys(old.files).isEmpty())
            assertTrue(accounts.database.offlineDao().pendingCleanup().isEmpty())
            assertNotNull(store.open(restored, url)).document.close()
        } finally { accounts.close(); removeDirectory(directory) }
    }

    @Test
    fun `moving the initial guest database into its account partition retains downloads but guest import omits them`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-guest-")
        val accounts = createTestAccounts(directory)
        try {
            val store = OfflineContentStore(accounts, DiskOfflineFiles(directory.resolve("files").toFile()))
            val initial = store.observeIdentity("user:fixture")
            val (bundle, bytes) = bundle()
            store.beginCapture(initial).apply { stage(bundle.resources.single(), bytes); publish(bundle, true) }
            accounts.activate("guest")
            val guest = assertNotNull(store.initialize())
            assertEquals(initial.id, guest.id)
            assertNotNull(store.open(guest, url)).document.close()
            accounts.activate("production:new-reader")
            accounts.importGuest("production:new-reader") { true }
            assertNull(store.initialize())
            assertTrue(accounts.database.offlineDao().contexts().isEmpty())
        } finally { accounts.close(); removeDirectory(directory) }
    }

    private fun removeDirectory(directory: Path) {
        Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
    }
}
