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

/**
 * Migration from version 4 to version 5:
 * - Adds `favourite_tag` table for cross-device tag-favourite sync. Tombstones-in-place
 *   (favourited = 0) so concurrent unfavourites propagate via LWW on `updatedAt`.
 */
val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL(
            """
            CREATE TABLE IF NOT EXISTS favourite_tag (
                tagType INTEGER NOT NULL,
                tag TEXT NOT NULL,
                favourited INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL,
                pendingSync INTEGER NOT NULL,
                PRIMARY KEY (tagType, tag)
            )
            """.trimIndent()
        )
        connection.execSQL(
            "CREATE INDEX IF NOT EXISTS index_favourite_tag_favourited ON favourite_tag(favourited)"
        )
        connection.execSQL(
            "CREATE INDEX IF NOT EXISTS index_favourite_tag_pendingSync ON favourite_tag(pendingSync)"
        )
    }
}

/**
 * Migration from version 5 to version 6:
 * - Adds `saved_search` table for cross-device saved-search sync. Tombstones-in-place
 *   (deleted = 1) so concurrent deletes propagate via LWW on `updatedAt`.
 */
val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL(
            """
            CREATE TABLE IF NOT EXISTS saved_search (
                id TEXT NOT NULL,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                deleted INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL,
                pendingSync INTEGER NOT NULL,
                PRIMARY KEY (id)
            )
            """.trimIndent()
        )
        connection.execSQL(
            "CREATE INDEX IF NOT EXISTS index_saved_search_deleted ON saved_search(deleted)"
        )
        connection.execSQL(
            "CREATE INDEX IF NOT EXISTS index_saved_search_pendingSync ON saved_search(pendingSync)"
        )
    }
}

val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL("CREATE TABLE IF NOT EXISTS active_account (id INTEGER NOT NULL PRIMARY KEY, owner TEXT NOT NULL, remoteCursor TEXT, localCursor INTEGER)")
        connection.execSQL("CREATE TABLE IF NOT EXISTS account_archive (owner TEXT NOT NULL PRIMARY KEY, data TEXT NOT NULL, remoteCursor TEXT, localCursor INTEGER)")
    }
}
