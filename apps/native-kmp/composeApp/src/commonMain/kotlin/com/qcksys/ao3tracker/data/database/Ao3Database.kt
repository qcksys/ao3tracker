package com.qcksys.ao3tracker.data.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.ConstructedBy
import androidx.room.RoomDatabaseConstructor

@Database(
    entities = [
        WorkEntity::class,
        ChapterEntity::class,
        TagEntity::class,
        FavouriteTagEntity::class,
        SavedSearchEntity::class,
        SearchCheckEntity::class,
        ActiveAccountEntity::class,
        AccountArchiveEntity::class,
        AccountDatabaseEntity::class
    ],
    version = 10,
    exportSchema = true
)
@ConstructedBy(Ao3DatabaseConstructor::class)
abstract class Ao3Database : RoomDatabase() {
    abstract fun workDao(): WorkDao
    abstract fun chapterDao(): ChapterDao
    abstract fun tagDao(): TagDao
    abstract fun favouriteTagDao(): FavouriteTagDao
    abstract fun savedSearchDao(): SavedSearchDao
    abstract fun searchCheckDao(): SearchCheckDao
    abstract fun accountDao(): AccountDao
}

@Suppress("NO_ACTUAL_FOR_EXPECT")
expect object Ao3DatabaseConstructor : RoomDatabaseConstructor<Ao3Database> {
    override fun initialize(): Ao3Database
}

internal const val DB_FILE_NAME = "ao3tracker.db"
