package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.data.database.OfflineChapterEntity
import com.qcksys.ao3tracker.data.database.OfflineSkinEntity
import kotlin.test.*

class OfflineStoragePolicyTest {
    private val scope = OfflineFileScope("account", "context")
    private fun chapter(id: Long, accessed: Long = id, resources: String = "[]") = OfflineChapterEntity(
        "context", "$id", id, id, "chapter", "https://archiveofourown.org/works/$id", "page$id", "skin", resources, 0, accessed, 10)
    private fun inventory(vararg chapters: OfflineChapterEntity) = OfflineInventory(scope, chapters.toList(),
        mapOf("skin" to OfflineSkinEntity("context", "skin", "skin-file", "[]", 0, 5)), "skin", emptySet(),
        chapters.associate { it.fileHash to it.bytes } + ("skin-file" to 5L), emptySet(), emptySet())

    @Test
    fun `eviction follows access order across accounts and stops when the allowance fits`() {
        val first = inventory(chapter(1, 30), chapter(2, 10))
        val second = inventory(chapter(3, 20)).copy(scope = scope.copy(owner = "second"))
        assertEquals(40, offlineStorageUsage(listOf(first, second)).automaticBytes)
        assertEquals(setOf(OfflineChapterReference(first.scope, "2"), OfflineChapterReference(second.scope, "3")),
            automaticEvictions(listOf(first, second), 20))
    }

    @Test
    fun `shared resources are counted once and stay until their last chapter is removed`() {
        val resource = OfflineResource("shared", "image/png", 100)
        val resources = offlineJson.encodeToString(listOf(resource))
        val saved = inventory(chapter(1, resources = resources), chapter(2, resources = resources))
            .let { it.copy(fileSizes = it.fileSizes + ("shared" to 100L)) }
        assertEquals(125, offlineStorageUsage(listOf(saved)).automaticBytes)
        assertEquals(setOf(OfflineChapterReference(scope, "1"), OfflineChapterReference(scope, "2")), automaticEvictions(listOf(saved), 25))
    }

    @Test
    fun `pinned content and its shared skin do not consume the automatic allowance`() {
        val saved = inventory(chapter(1), chapter(2)).copy(pinnedWorks = setOf(1))
        assertEquals(OfflineStorageUsage(10, 15), offlineStorageUsage(listOf(saved)))
        assertEquals(setOf(OfflineChapterReference(scope, "2")), automaticEvictions(listOf(saved), 0))
    }

    @Test
    fun `open and promised chapters cannot be evicted and unsatisfiable space fails without a partial eviction plan`() {
        val saved = inventory(chapter(1), chapter(2), chapter(3)).copy(leasedFiles = setOf("page1"), protectedChapters = setOf("2"))
        assertEquals(setOf(OfflineChapterReference(scope, "3")), automaticEvictions(listOf(saved), 25))
        assertFailsWith<OfflineAllowanceExceeded> { automaticEvictions(listOf(saved), 24) }
    }
}
