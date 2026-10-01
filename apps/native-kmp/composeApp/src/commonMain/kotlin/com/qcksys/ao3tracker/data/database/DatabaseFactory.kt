package com.qcksys.ao3tracker.data.database

import androidx.room.RoomDatabase

expect fun getDatabaseBuilder(fileName: String = DB_FILE_NAME): RoomDatabase.Builder<Ao3Database>
