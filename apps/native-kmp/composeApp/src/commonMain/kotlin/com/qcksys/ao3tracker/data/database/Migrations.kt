package com.qcksys.ao3tracker.data.database

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL

/**
 * Migration from version 1 to version 2:
 * - Adds `subscribed` column to works table for push notification subscriptions
 */
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL("ALTER TABLE works ADD COLUMN subscribed INTEGER NOT NULL DEFAULT 0")
    }
}

/**
 * Migration from version 2 to version 3:
 * - Adds `favourite` column to works table for marking favourite works
 */
val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL("ALTER TABLE works ADD COLUMN favourite INTEGER NOT NULL DEFAULT 0")
    }
}

/**
 * Migration from version 3 to version 4:
 * - Adds `subscribedUpdatedAt` and `favouriteUpdatedAt` columns for LWW conflict resolution
 */
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL("ALTER TABLE works ADD COLUMN subscribedUpdatedAt INTEGER DEFAULT NULL")
        connection.execSQL("ALTER TABLE works ADD COLUMN favouriteUpdatedAt INTEGER DEFAULT NULL")
    }
}
