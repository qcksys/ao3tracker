package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.offline.*
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.xml.parsers.DocumentBuilderFactory
import kotlinx.coroutines.test.runTest
import org.w3c.dom.Document
import kotlin.test.*
import kotlin.time.Instant

class OfflineArchiveTest {
    private val exportedAt = Instant.parse("2026-11-18T10:00:00.123Z")
    private val image = byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3)
    private val imageResource = OfflineResource(offlineResourceHash("image/png", image), "image/png", image.size.toLong())

    @Test
    fun `an archive imports into another device's downloads with its skin and images`() = runTest {
        stores { source, target, directory ->
            val from = source.observeIdentity("user:fixture")
            source.save(from, "456")
            source.save(from, "789")
            val file = directory.resolve("export.zip").toFile()
            assertEquals(OfflineExportSummary(1, 2, 0), source.exportArchive(from, file))

            val to = target.observeIdentity("guest")
            assertEquals(OfflineImportResult(1, 2, 0, 0), ZipOfflineArchive(file).use { target.importArchive(to, it) })
            val status = target.statuses(to).single()
            assertTrue(status.work.pinned)
            assertEquals(setOf("456", "789"), status.savedChapterIds)
            val opened = assertNotNull(target.open(to, url("456")))
            assertEquals("guest", opened.document.page.ao3Identity)
            val html = assertNotNull(opened.document.readPath(opened.document.path)).bytes.decodeToString()
            assertTrue("Text of 456" in html)
            assertTrue(css("red").second.hash in html)
            assertContentEquals(image, opened.document.readPath("/resources/${imageResource.hash}")?.bytes)
            opened.document.close()
        }
    }

    @Test
    fun `an import keeps chapters saved at the same or a newer revision and replaces older ones`() = runTest {
        stores { source, target, directory ->
            val from = source.observeIdentity("user:fixture")
            source.save(from, "456", revision = "2026-02-01T00:00:00Z")
            source.save(from, "789", revision = "2026-02-01T00:00:00Z")
            val file = directory.resolve("export.zip").toFile()
            source.exportArchive(from, file)

            val to = target.observeIdentity("guest")
            target.save(to, "456", revision = "2026-03-01T00:00:00Z")
            target.save(to, "789", revision = "2026-01-01T00:00:00Z")
            assertEquals(OfflineImportResult(1, 1, 1, 0), ZipOfflineArchive(file).use { target.importArchive(to, it) })
            assertEquals("2026-03-01T00:00:00Z", target.open(to, url("456"))!!.also { it.document.close() }.document.page.downloadUpdatedAt)
            assertEquals("2026-02-01T00:00:00Z", target.open(to, url("789"))!!.also { it.document.close() }.document.page.downloadUpdatedAt)
        }
    }

    @Test
    fun `an older archive keeps the device's longer chapter list and title`() = runTest {
        stores { source, target, directory ->
            val from = source.observeIdentity("user:fixture")
            source.save(from, "789")
            val file = directory.resolve("export.zip").toFile()
            source.exportArchive(from, file)

            val to = target.observeIdentity("guest")
            val longer = listOf("456", "789", "800").mapIndexed { index, id -> OfflineChapter(id, index + 1, "Chapter ${index + 1}", url(id)) }
            target.save(to, "456", title = "Renamed", chapters = longer)
            assertEquals(OfflineImportResult(1, 1, 0, 0), ZipOfflineArchive(file).use { target.importArchive(to, it) })
            val status = target.statuses(to).single()
            assertEquals("Renamed", status.work.title)
            assertEquals(longer, status.chapters)
            assertEquals(setOf("456", "789"), status.savedChapterIds)
        }
    }

    @Test
    fun `an archive that expands far beyond its size is rejected`() = runTest {
        stores { _, _, directory ->
            val file = directory.resolve("expanding.zip").toFile()
            zip(file, mapOf(OFFLINE_ARCHIVE_MANIFEST to """{"format":"$OFFLINE_ARCHIVE_FORMAT","version":1}""".encodeToByteArray(),
                offlineArchiveFile("0".repeat(64)) to ByteArray(80 * 1024 * 1024)))
            assertTrue(file.length() < 1024 * 1024)
            assertFailsWith<OfflineArchiveInvalid> { ZipOfflineArchive(file) }
        }
    }

    @Test
    fun `an export without readable chapters leaves no file behind`() = runTest {
        stores { source, _, directory ->
            val context = source.observeIdentity("user:fixture")
            val file = directory.resolve("empty.zip")
            val summary = source.exportSnapshot(context).use { getOfflineDocuments().export(file.toString(), OfflineExportFormat.Archive, it, exportedAt) }
            assertEquals(0, summary.chapters)
            assertFalse(Files.exists(file))
        }
    }

    @Test
    fun `damaged chapters are skipped while the rest of the archive imports`() = runTest {
        stores { source, target, directory ->
            val from = source.observeIdentity("user:fixture")
            source.save(from, "456")
            source.save(from, "789")
            val file = directory.resolve("export.zip").toFile()
            source.exportArchive(from, file)
            val manifest = ZipFile(file).use { zip ->
                offlineJson.decodeFromString<OfflineArchiveManifest>(zip.getInputStream(zip.getEntry(OFFLINE_ARCHIVE_MANIFEST)).readBytes().decodeToString())
            }
            val damaged = offlineArchiveFile(manifest.works.single().saved.first { it.chapterId == 456L }.file)
            val copy = directory.resolve("damaged.zip").toFile()
            rewrite(file, copy) { name, bytes -> if (name == damaged) bytes.copyOf(bytes.size - 1) else bytes }

            val to = target.observeIdentity("guest")
            assertEquals(OfflineImportResult(1, 1, 0, 1), ZipOfflineArchive(copy).use { target.importArchive(to, it) })
            assertEquals(setOf("789"), target.statuses(to).single().savedChapterIds)
        }
    }

    @Test
    fun `files that are not exports of downloaded works are rejected before anything is saved`() = runTest {
        stores { _, target, directory ->
            val to = target.observeIdentity("guest")
            val text = directory.resolve("notes.txt").toFile().apply { writeText("Not a ZIP file") }
            assertFailsWith<OfflineArchiveInvalid> { ZipOfflineArchive(text) }

            val other = directory.resolve("other.zip").toFile()
            zip(other, mapOf("readme.txt" to "Hello".encodeToByteArray()))
            val notExport = assertFailsWith<OfflineArchiveInvalid> { ZipOfflineArchive(other).use { target.importArchive(to, it) } }
            assertEquals("This file is not an export of downloaded works.", notExport.message)

            val newer = directory.resolve("newer.zip").toFile()
            zip(newer, mapOf(OFFLINE_ARCHIVE_MANIFEST to """{"format":"$OFFLINE_ARCHIVE_FORMAT","version":2,"extra":true}""".encodeToByteArray()))
            val future = assertFailsWith<OfflineArchiveInvalid> { ZipOfflineArchive(newer).use { target.importArchive(to, it) } }
            assertTrue(future.message!!.contains("newer version"))
            assertTrue(target.statuses(to).isEmpty())
        }
    }

    @Test
    fun `an export holds the selected works with the site skin they are read with`() = runTest {
        stores { source, _, _ ->
            val context = source.observeIdentity("user:fixture")
            source.save(context, "456")
            // A foreground capture of another work selects its skin as the active AO3 site skin.
            source.save(context, "90", workId = "9", colour = "blue", foreground = true)
            source.exportSnapshot(context, setOf(123)).use { snapshot ->
                val work = snapshot.works.single()
                assertEquals(123, work.workId)
                val exported = assertNotNull(snapshot.read(work.chapters.single()))
                assertEquals(offlineSkinHash(css("blue").first), exported.skin.hash)
            }
            assertEquals(listOf(9L, 123L), source.exportSnapshot(context).use { snapshot -> snapshot.works.map { it.workId }.sorted() })
        }
    }

    @Test
    fun `exported files stay on the device until the snapshot closes`() = runTest {
        stores { source, _, _ ->
            val context = source.observeIdentity("user:fixture")
            source.save(context, "456")
            val snapshot = source.exportSnapshot(context)
            val chapter = snapshot.works.single().chapters.single()
            source.removeWork(context, 123)
            assertNotNull(snapshot.read(chapter))
            snapshot.close()
            source.collectUnusedFiles()
            assertNull(snapshot.page(chapter))
        }
    }

    @Test
    fun `an EPUB export is a valid book with the saved text, tags and images`() = runTest {
        stores { source, _, _ ->
            val context = source.observeIdentity("user:fixture")
            source.save(context, "456")
            source.save(context, "789")
            val output = ByteArrayOutputStream()
            val summary = source.exportSnapshot(context).use { writeOfflineEpubs(it, output, exportedAt) }
            assertEquals(OfflineExportSummary(1, 2, 0), summary)

            val entries = unzip(output.toByteArray())
            assertEquals("mimetype", entries.keys.first())
            assertEquals(OFFLINE_EPUB_MIME_TYPE, entries.getValue("mimetype").decodeToString())
            ZipInputStream(ByteArrayInputStream(output.toByteArray())).use { assertEquals(ZipEntry.STORED, it.nextEntry!!.method) }
            val documents = entries.filterKeys { it.endsWith(".xhtml") || it.endsWith(".opf") || it.endsWith(".xml") }.mapValues { xml(it.value) }
            assertEquals(setOf("META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/title.xhtml",
                "OEBPS/chapter-1.xhtml", "OEBPS/chapter-2.xhtml"), documents.keys)

            val chapter = entries.getValue("OEBPS/chapter-1.xhtml").decodeToString()
            assertTrue("Text of 456 here" in documents.getValue("OEBPS/chapter-1.xhtml").documentElement.textContent)
            assertTrue("Text of 789" in documents.getValue("OEBPS/chapter-2.xhtml").documentElement.textContent)
            assertFalse("Chapter Text" in chapter)
            assertFalse("<script" in chapter)
            assertTrue("src=\"images/${imageResource.hash}.png\"" in chapter)
            assertFalse("example.com" in chapter)
            assertTrue("Remote art" in chapter)
            assertContentEquals(image, entries.getValue("OEBPS/images/${imageResource.hash}.png"))

            val title = documents.getValue("OEBPS/title.xhtml").documentElement.textContent
            assertTrue("Story" in title && "Author" in title && "Fandom" in title)
            assertTrue("href=\"https://archiveofourown.org/tags/Fandom/works\"" in entries.getValue("OEBPS/title.xhtml").decodeToString())

            val opf = documents.getValue("OEBPS/content.opf")
            fun text(tag: String) = opf.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", tag).item(0).textContent
            assertEquals("Story", text("title"))
            assertEquals("Author", text("creator"))
            assertEquals("en", text("language"))
            assertEquals("2026-11-18T10:00:00Z", opf.getElementsByTagName("meta").item(0).textContent)
            val spine = opf.getElementsByTagName("itemref").let { items -> (0 until items.length).map { items.item(it).attributes.getNamedItem("idref").nodeValue } }
            assertEquals(listOf("title", "chapter-1", "chapter-2"), spine)
            assertTrue("images/${imageResource.hash}.png" in entries.getValue("OEBPS/content.opf").decodeToString())
        }
    }

    @Test
    fun `several works export as a ZIP holding one EPUB book per work`() = runTest {
        stores { source, _, _ ->
            val context = source.observeIdentity("user:fixture")
            source.save(context, "456")
            source.save(context, "90", workId = "9")
            val output = ByteArrayOutputStream()
            val summary = source.exportSnapshot(context).use { writeOfflineEpubs(it, output, exportedAt) }
            assertEquals(OfflineExportSummary(2, 2, 0), summary)
            val books = unzip(output.toByteArray())
            assertEquals(setOf("Story (123).epub", "Story (9).epub"), books.keys)
            books.values.forEach { assertEquals("mimetype", unzip(it).keys.first()) }
        }
    }

    private suspend fun stores(block: suspend (OfflineContentStore, OfflineContentStore, Path) -> Unit) {
        val directory = Files.createTempDirectory("ao3-offline-transfer-")
        val sourceAccounts = createTestAccounts(Files.createDirectory(directory.resolve("source")))
        val targetAccounts = createTestAccounts(Files.createDirectory(directory.resolve("target")))
        try {
            block(OfflineContentStore(sourceAccounts, DiskOfflineFiles(directory.resolve("source-files").toFile())),
                OfflineContentStore(targetAccounts, DiskOfflineFiles(directory.resolve("target-files").toFile())), directory)
        } finally {
            sourceAccounts.close()
            targetAccounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private fun url(chapterId: String, workId: String = "123") = "https://archiveofourown.org/works/$workId/chapters/$chapterId"

    private fun css(colour: String): Pair<List<OfflineStyle>, OfflineResource> {
        val bytes = "body{color:$colour}".encodeToByteArray()
        val resource = OfflineResource(offlineResourceHash("text/css", bytes), "text/css", bytes.size.toLong())
        return listOf(OfflineStyle("@import url('/resources/${resource.hash}');", url("456"), "all", false)) to resource
    }

    private suspend fun OfflineContentStore.save(context: OfflineContext, chapterId: String, workId: String = "123", revision: String? = null,
        colour: String = "red", foreground: Boolean = false, title: String = "Story", chapters: List<OfflineChapter>? = null) {
        val (styles, style) = css(colour)
        val html = "<html><head></head><body><div id=\"main\"><ul class=\"work navigation actions\"><li>Entire Work</li></ul>" +
            "<dl class=\"work meta group\"><dt class=\"language\">Language:</dt><dd class=\"language\" lang=\"en\">English</dd>" +
            "<dt class=\"fandom tags\">Fandom:</dt><dd class=\"fandom tags\"><ul class=\"commas\"><li><a class=\"tag\" href=\"/tags/Fandom/works\">Fandom</a></li></ul></dd></dl>" +
            "<div id=\"workskin\"><div class=\"preface group\"><h2 class=\"title heading\">Story</h2><h3 class=\"byline heading\">Author</h3></div>" +
            "<div id=\"chapters\"><div class=\"chapter\"><div class=\"userstuff module\"><h3 class=\"landmark heading\">Chapter Text</h3>" +
            "<p>Text of $chapterId&nbsp;here<br>next line</p><img src=\"/resources/${imageResource.hash}\" alt=\"Art\">" +
            "<img src=\"https://example.com/remote.png\" alt=\"Remote art\"></div></div></div></div>" +
            "<div id=\"feedback\"><ul class=\"actions\"><li>Kudos</li></ul></div></div></body></html>"
        val list = chapters ?: if (workId == "123") listOf(OfflineChapter("456", 1, "1. One", url("456")), OfflineChapter("789", 2, "2. Two", url("789")))
            else listOf(OfflineChapter(chapterId, 1, "1. Chapter $chapterId", url(chapterId, workId)))
        val page = OfflinePage(1, url(chapterId, workId), workId, chapterId, "chapter", title, context.identity, foreground, html, styles,
            list, revision)
        val capture = beginCapture(context)
        capture.stage(style, "body{color:$colour}".encodeToByteArray())
        capture.stage(imageResource, image)
        capture.publish(OfflineBundle(page, offlineSkinHash(styles), listOf(style, imageResource), emptyList()), foreground, pin = true)
        capture.cancel()
    }

    private suspend fun OfflineContentStore.exportArchive(context: OfflineContext, file: File): OfflineExportSummary =
        exportSnapshot(context).use { snapshot -> file.outputStream().use { writeOfflineArchive(snapshot, it, exportedAt) } }

    private fun zip(file: File, entries: Map<String, ByteArray>) = ZipOutputStream(file.outputStream()).use { zip ->
        entries.forEach { (name, bytes) -> zip.putNextEntry(ZipEntry(name)); zip.write(bytes); zip.closeEntry() }
    }

    private fun rewrite(source: File, destination: File, transform: (String, ByteArray) -> ByteArray) =
        zip(destination, ZipFile(source).use { zip -> zip.entries().toList().associate { it.name to transform(it.name, zip.getInputStream(it).readBytes()) } })

    private fun unzip(bytes: ByteArray): LinkedHashMap<String, ByteArray> = ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
        val entries = linkedMapOf<String, ByteArray>()
        while (true) {
            val entry = zip.nextEntry ?: break
            entries[entry.name] = zip.readBytes()
        }
        entries
    }

    private fun xml(bytes: ByteArray): Document =
        DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
}
