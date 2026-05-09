package com.qcksys.ao3tracker.data.database

import androidx.room.Room
import androidx.room.RoomDatabase
import java.io.File

actual fun getDatabaseBuilder(): RoomDatabase.Builder<Ao3Database> {
    val dbFile = File(System.getProperty("user.home"), ".ao3tracker/$DB_FILE_NAME")
    dbFile.parentFile?.mkdirs()
    return Room.databaseBuilder<Ao3Database>(
        name = dbFile.absolutePath
    )
}
