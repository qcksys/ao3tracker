package com.qcksys.ao3tracker.data.offline

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.TextNode
import java.io.OutputStream
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.time.Instant

// EPUB core media types for images; other images are left out.
private val epubImageTypes = mapOf("image/gif" to "gif", "image/jpeg" to "jpg", "image/png" to "png", "image/webp" to "webp")
private val resourcePath = Regex("/resources/([a-f0-9]{64})$")
private val languageTag = Regex("^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$")

private const val EPUB_STYLE = """body { margin: 0 5%; line-height: 1.5; }
h1, h2, h3 { line-height: 1.2; }
dl.tags dt { font-weight: bold; margin-top: 0.5em; }
dl.tags dd { margin: 0 0 0 1em; }
dl.tags ul, dl.tags li { display: inline; list-style: none; margin: 0; padding: 0; }
dl.tags li:not(:last-child)::after { content: ", "; }
blockquote { margin: 1em 2em; }
img { max-width: 100%; }
"""

private const val EPUB_CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""

/**
 * Writes the saved chapters of [snapshot] as EPUB books for e-book apps: one work as an EPUB file, several as a ZIP
 * holding an EPUB file per work. Books contain the work's text, notes, tags and images without AO3's site skin.
 */
internal fun writeOfflineEpubs(snapshot: OfflineExportSnapshot, output: OutputStream, exportedAt: Instant): OfflineExportSummary {
    var chapters = 0
    if (snapshot.works.size == 1) {
        chapters = writeOfflineEpub(snapshot, snapshot.works.single(), output, exportedAt)
    } else ZipOutputStream(openStream(output)).use { zip ->
        val names = mutableSetOf<String>()
        for (work in snapshot.works) {
            val base = "${offlineFileName(work.title)} (${work.workId})"
            val name = generateSequence(1) { it + 1 }.map { if (it == 1) "$base.epub" else "$base $it.epub" }.first { names.add(it) }
            zip.putNextEntry(ZipEntry(name))
            chapters += writeOfflineEpub(snapshot, work, zip, exportedAt)
            zip.closeEntry()
        }
    }
    val total = snapshot.works.sumOf { it.chapters.size }
    return OfflineExportSummary(snapshot.works.size, chapters, total - chapters)
}

/** Writes [work] as an EPUB 3 book to [output], leaving it open, and returns the number of chapters written. */
private fun writeOfflineEpub(snapshot: OfflineExportSnapshot, work: OfflineExportWork, output: OutputStream, exportedAt: Instant): Int =
    ZipOutputStream(openStream(output)).use { zip -> writeEpubEntries(snapshot, work, zip, exportedAt) }

private fun writeEpubEntries(snapshot: OfflineExportSnapshot, work: OfflineExportWork, zip: ZipOutputStream, exportedAt: Instant): Int {
    fun entry(name: String, bytes: ByteArray) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(bytes)
        zip.closeEntry()
    }
    // The uncompressed mimetype entry comes first, so readers can identify the file.
    val mimetype = OFFLINE_EPUB_MIME_TYPE.encodeToByteArray()
    zip.putNextEntry(ZipEntry("mimetype").apply {
        method = ZipEntry.STORED
        size = mimetype.size.toLong()
        compressedSize = size
        crc = CRC32().apply { update(mimetype) }.value
    })
    zip.write(mimetype)
    zip.closeEntry()
    entry("META-INF/container.xml", EPUB_CONTAINER.encodeToByteArray())
    entry("OEBPS/style.css", EPUB_STYLE.encodeToByteArray())

    val images = linkedMapOf<String, OfflineResource>()
    val chapters = mutableListOf<Pair<String, String>>()
    var front: Document? = null
    for (chapter in work.chapters) {
        val page = snapshot.page(chapter)?.page ?: continue
        val document = Jsoup.parse(page.html, page.url)
        document.outputSettings().syntax(Document.OutputSettings.Syntax.xml).prettyPrint(false)
        prepareEpubDocument(document, chapter.resources.associateBy { it.hash }) { resource ->
            if (resource.hash !in images) {
                val bytes = snapshot.resource(resource) ?: return@prepareEpubDocument false
                entry("OEBPS/${epubImage(resource)}", bytes)
                images[resource.hash] = resource
            }
            true
        }
        if (front == null) front = document
        val content = document.selectFirst("#chapters")
        val body = when {
            content != null -> content.outerHtml() + document.select("#workskin > .afterword").outerHtml()
            else -> document.selectFirst("#workskin")?.outerHtml() ?: document.body().html()
        }
        val label = page.chapters.firstOrNull { it.id == page.chapterId }?.let { it.title.ifBlank { "Chapter ${it.number}" } }
            ?: "Chapter ${chapters.size + 1}"
        val href = "chapter-${chapters.size + 1}.xhtml"
        entry("OEBPS/$href", epubDocument(label, epubLanguage(front), body).encodeToByteArray())
        chapters += href to label
    }

    val title = work.title
    val heading = front?.selectFirst("#workskin > .preface:not(.afterword)")?.outerHtml() ?: "<h1>${xmlText(title)}</h1>"
    val tags = front?.selectFirst("dl.work.meta")?.outerHtml().orEmpty()
    val missing = if (chapters.isEmpty()) "<p>No saved chapters of this work could be read.</p>" else ""
    val language = epubLanguage(front)
    entry("OEBPS/title.xhtml", epubDocument(title, language, heading + tags + missing).encodeToByteArray())
    val contents = (listOf("title.xhtml" to title) + chapters).joinToString("") { (href, label) -> "<li><a href=\"$href\">${xmlText(label)}</a></li>" }
    entry("OEBPS/nav.xhtml", epubDocument("Contents", language,
        "<nav epub:type=\"toc\" id=\"toc\"><h1>Contents</h1><ol>$contents</ol></nav>").encodeToByteArray())
    val author = front?.selectFirst("#workskin > .preface h3.byline")?.text()?.takeIf { it.isNotBlank() }
    val workUrl = "https://archiveofourown.org/works/${work.workId}"
    val items = listOf(
        "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>",
        "<item id=\"style\" href=\"style.css\" media-type=\"text/css\"/>",
        "<item id=\"title\" href=\"title.xhtml\" media-type=\"application/xhtml+xml\"/>"
    ) + chapters.mapIndexed { index, (href, _) -> "<item id=\"chapter-${index + 1}\" href=\"$href\" media-type=\"application/xhtml+xml\"/>" } +
        images.values.map { "<item id=\"image-${it.hash}\" href=\"${epubImage(it)}\" media-type=\"${it.mimeType}\"/>" }
    val spine = (listOf("title") + chapters.indices.map { "chapter-${it + 1}" }).joinToString("") { "<itemref idref=\"$it\"/>" }
    entry("OEBPS/content.opf", ("""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="work-id" xml:lang="$language">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="work-id">$workUrl</dc:identifier>
<dc:title>${xmlText(title)}</dc:title>
<dc:language>$language</dc:language>
${author?.let { "<dc:creator>${xmlText(it)}</dc:creator>\n" }.orEmpty()}<dc:source>$workUrl</dc:source>
<meta property="dcterms:modified">${Instant.fromEpochSeconds(exportedAt.epochSeconds)}</meta>
</metadata>
<manifest>${items.joinToString("")}</manifest>
<spine>$spine</spine>
</package>
""").encodeToByteArray())
    return chapters.size
}

/**
 * Removes interactive and page-navigation elements, makes links absolute, and keeps the images that [include] adds
 * to the book, replacing others with their alternative text.
 */
private fun prepareEpubDocument(document: Document, resources: Map<String, OfflineResource>, include: (OfflineResource) -> Boolean) {
    // Audio and video cannot be included, and remote sources are not allowed in EPUB books.
    document.select("script, noscript, iframe, object, embed, audio, video, source, track, form, input, button, select, textarea, " +
        "link, meta, style, .landmark, #feedback, ul.navigation, ul.actions").remove()
    for (element in document.getAllElements()) {
        element.attributes().asList().map { it.key }
            .filter { it.startsWith("on", ignoreCase = true) || it == "srcset" || it == "sizes" }
            .forEach(element::removeAttr)
        if (element.attr("style").contains("url(", ignoreCase = true)) element.removeAttr("style")
    }
    for (link in document.select("a[href]")) {
        if (link.attr("href").startsWith("#")) continue
        val absolute = link.absUrl("href")
        if (absolute.startsWith("https://") || absolute.startsWith("http://")) link.attr("href", absolute) else link.removeAttr("href")
    }
    for (image in document.select("img")) {
        val hash = resourcePath.find(image.attr("src"))?.groupValues?.get(1)
        val resource = hash?.let { resources[it] }?.takeIf { it.mimeType in epubImageTypes }
        if (resource != null && include(resource)) image.attr("src", epubImage(resource))
        else image.replaceWith(TextNode(image.attr("alt")))
    }
}

private fun epubImage(resource: OfflineResource) = "images/${resource.hash}.${epubImageTypes.getValue(resource.mimeType)}"

private fun epubLanguage(document: Document?): String =
    document?.selectFirst("dl.work.meta dd.language[lang]")?.attr("lang")?.takeIf { languageTag.matches(it) } ?: "en"

private fun epubDocument(title: String, language: String, body: String) = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="$language" lang="$language">
<head><meta charset="UTF-8"/><title>${xmlText(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>$body</body>
</html>
"""

private fun xmlText(value: String) = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
