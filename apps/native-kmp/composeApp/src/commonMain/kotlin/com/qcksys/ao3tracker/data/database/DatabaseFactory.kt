package com.qcksys.ao3tracker.data.database

import androidx.room.RoomDatabase

expect fun getDatabaseBuilder(): RoomDatabase.Builder<Ao3Database>
