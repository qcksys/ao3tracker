package com.qcksys.ao3tracker.data.database

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase

private lateinit var appContext: Context

fun initializeDatabase(context: Context) {
    appContext = context.applicationContext
}

actual fun getDatabaseBuilder(fileName: String): RoomDatabase.Builder<Ao3Database> {
    return Room.databaseBuilder<Ao3Database>(
        context = appContext,
        name = appContext.getDatabasePath(fileName).absolutePath
    )
}
