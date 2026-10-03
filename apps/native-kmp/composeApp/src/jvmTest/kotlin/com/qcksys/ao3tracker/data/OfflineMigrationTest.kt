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

class OfflineMigrationTest {
    @Test
    fun `v10 migration creates empty offline indexes without changing account or pending library data`() = runTest {
        val directory = Files.createTempDirectory("ao3-offline-migration-")
        val schema = Json.parseToJsonElement(Files.readString(Path.of("schemas/com.qcksys.ao3tracker.data.database.Ao3Database/10.json"))).jsonObject["database"]!!.jsonObject
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
            connection.execSQL("PRAGMA user_version = 10")
            connection.execSQL("INSERT INTO active_account(id,owner,remoteCursor,localCursor) VALUES (0,'guest','cursor',987)")
            connection.execSQL("INSERT INTO saved_search(id,name,url,deleted,updatedAt,pendingSync) VALUES ('search','Stories','https://archiveofourown.org/works',0,100,1)")
        }
        val accounts = createTestAccounts(directory)
        try {
            val account = accounts.initialize()
            assertEquals("cursor", account.remoteCursor)
            assertEquals(987, account.localCursor)
            assertTrue(accounts.database.offlineDao().contexts().isEmpty())
            assertTrue(accounts.database.offlineDao().chapters("unused").isEmpty())
            assertTrue(accounts.database.offlineDao().jobs("unused").isEmpty())
            val search = assertNotNull(accounts.database.savedSearchDao().getOne("search"))
            assertEquals(100, search.updatedAt)
            assertTrue(search.pendingSync)
        } finally {
            accounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }
}
