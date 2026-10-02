package com.qcksys.ao3tracker.data

import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.sqlite.execSQL
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.*

class SearchCheckMigrationTest {
    @Test
    fun `v9 checks retain their full snapshot and saved search without inventing unread work IDs`() = runTest {
        val directory = Files.createTempDirectory("ao3tracker-search-migration-")
        val schema = Json.parseToJsonElement(Files.readString(Path.of("schemas/com.qcksys.ao3tracker.data.database.Ao3Database/9.json"))).jsonObject["database"]!!.jsonObject
        BundledSQLiteDriver().open(directory.resolve("test.db").toString()).use { connection ->
            schema["entities"]!!.jsonArray.forEach { entry ->
                val entity = entry.jsonObject
                val table = entity["tableName"]!!.jsonPrimitive.content
                connection.execSQL(entity["createSql"]!!.jsonPrimitive.content.replace("\${TABLE_NAME}", table))
                entity["indices"]?.jsonArray.orEmpty().forEach {
                    connection.execSQL(it.jsonObject["createSql"]!!.jsonPrimitive.content.replace("\${TABLE_NAME}", table))
                }
            }
            schema["setupQueries"]!!.jsonArray.forEach { connection.execSQL(it.jsonPrimitive.content) }
            connection.execSQL("PRAGMA user_version = 9")
            connection.execSQL("INSERT INTO saved_search(id,name,url,deleted,updatedAt,pendingSync) VALUES ('search','Stories','https://archiveofourown.org/works',0,100,0)")
            connection.execSQL("INSERT INTO search_check(searchId,url,context,worksJson,checkedAt,previousCheckedAt,newWorks,updatedWorks) VALUES ('search','https://archiveofourown.org/works','context','[]',200,100,3,2)")
        }
        val accounts = createTestAccounts(directory)
        try {
            accounts.initialize()
            val check = assertNotNull(accounts.database.searchCheckDao().getOne("search"))
            assertEquals(200, check.checkedAt)
            assertEquals("context", check.context)
            assertEquals("[]", check.worksJson)
            assertTrue(check.fullSnapshot)
            assertFalse(check.partial)
            assertEquals("{}", check.changesJson)
            assertEquals(0, check.newWorks)
            assertEquals(0, check.updatedWorks)
            assertNull(check.lastViewedAt)
            assertNull(check.previousCheckedAt)
            val search = assertNotNull(accounts.database.savedSearchDao().getOne("search"))
            assertFalse(search.pendingSync)
            assertEquals(100, search.updatedAt)
        } finally {
            accounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }
}
