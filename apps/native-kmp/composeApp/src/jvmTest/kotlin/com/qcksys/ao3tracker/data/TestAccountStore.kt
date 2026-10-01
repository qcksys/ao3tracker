package com.qcksys.ao3tracker.data

import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.Ao3Database
import com.qcksys.ao3tracker.data.database.MIGRATION_6_7
import com.qcksys.ao3tracker.data.database.MIGRATION_7_8
import java.nio.file.Path
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.Dispatchers

internal fun createTestAccounts(directory: Path, context: CoroutineContext = Dispatchers.IO): AccountDataStore {
    val openDatabase = { fileName: String ->
        Room.databaseBuilder<Ao3Database>(directory.resolve(fileName).toString())
            .setDriver(BundledSQLiteDriver())
            .setQueryCoroutineContext(context)
            .addMigrations(MIGRATION_6_7, MIGRATION_7_8)
            .build()
    }
    return AccountDataStore(openDatabase("test.db"), openDatabase)
}
