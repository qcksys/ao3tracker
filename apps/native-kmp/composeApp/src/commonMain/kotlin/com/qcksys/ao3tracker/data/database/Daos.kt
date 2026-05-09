package com.qcksys.ao3tracker.data.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkDao {
    @Query("SELECT * FROM works WHERE rowDeletedAt IS NULL ORDER BY lastRead DESC")
    fun getAllWorks(): Flow<List<WorkEntity>>

    @Query("SELECT * FROM works WHERE rowDeletedAt IS NULL ORDER BY lastRead DESC")
    suspend fun getAllWorksOnce(): List<WorkEntity>

    @Query("SELECT * FROM works ORDER BY lastRead DESC")
    suspend fun getAllWorksIncludingDeletedOnce(): List<WorkEntity>

    @Query("SELECT * FROM works WHERE id = :id AND rowDeletedAt IS NULL")
    suspend fun getWorkById(id: Long): WorkEntity?

    @Query("SELECT * FROM works WHERE id = :id")
    suspend fun getWorkByIdIncludingDeleted(id: Long): WorkEntity?

    @Query("SELECT * FROM works WHERE id = :id AND rowDeletedAt IS NULL")
    fun getWorkByIdFlow(id: Long): Flow<WorkEntity?>

    @Query("""
        SELECT * FROM works
        WHERE rowDeletedAt IS NULL AND (title LIKE '%' || :query || '%' OR author LIKE '%' || :query || '%')
        ORDER BY lastRead DESC
    """)
    fun searchWorks(query: String): Flow<List<WorkEntity>>

    @Query("SELECT id FROM works WHERE rowDeletedAt IS NULL")
    suspend fun getAllWorkIds(): List<Long>

    @Query("SELECT * FROM works WHERE rowDeletedAt IS NULL ORDER BY lastRead DESC LIMIT :limit OFFSET :offset")
    suspend fun getWorksPaginated(limit: Int, offset: Int): List<WorkEntity>

    @Query("""
        SELECT * FROM works
        WHERE rowDeletedAt IS NULL AND (title LIKE '%' || :query || '%' OR author LIKE '%' || :query || '%')
        ORDER BY lastRead DESC
        LIMIT :limit OFFSET :offset
    """)
    suspend fun searchWorksPaginated(query: String, limit: Int, offset: Int): List<WorkEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertWork(work: WorkEntity)

    @Upsert
    suspend fun upsertWork(work: WorkEntity)

    @Update
    suspend fun updateWork(work: WorkEntity)

    @Query("UPDATE works SET lastRead = :lastRead, rowUpdatedAt = :rowUpdatedAt WHERE id = :id")
    suspend fun updateLastRead(id: Long, lastRead: Long, rowUpdatedAt: Long)

    @Query("UPDATE works SET rowDeletedAt = :rowDeletedAt, rowUpdatedAt = :rowUpdatedAt WHERE id = :id")
    suspend fun softDeleteWork(id: Long, rowDeletedAt: Long, rowUpdatedAt: Long)

    @Query("UPDATE works SET markedCompleteAt = :markedCompleteAt, rowUpdatedAt = :rowUpdatedAt WHERE id = :id")
    suspend fun markWorkComplete(id: Long, markedCompleteAt: Long, rowUpdatedAt: Long)

    @Query("UPDATE works SET subscribed = :subscribed, subscribedUpdatedAt = :subscribedUpdatedAt, rowUpdatedAt = :rowUpdatedAt WHERE id = :id")
    suspend fun updateSubscription(id: Long, subscribed: Boolean, subscribedUpdatedAt: Long, rowUpdatedAt: Long)

    @Query("UPDATE works SET favourite = :favourite, favouriteUpdatedAt = :favouriteUpdatedAt, rowUpdatedAt = :rowUpdatedAt WHERE id = :id")
    suspend fun updateFavourite(id: Long, favourite: Boolean, favouriteUpdatedAt: Long, rowUpdatedAt: Long)

    @Query("UPDATE works SET subscribed = :subscribed, subscribedUpdatedAt = :subscribedUpdatedAt, rowUpdatedAt = :rowUpdatedAt WHERE rowDeletedAt IS NULL")
    suspend fun updateAllSubscriptions(subscribed: Boolean, subscribedUpdatedAt: Long, rowUpdatedAt: Long)

    @Query("DELETE FROM works WHERE id = :id")
    suspend fun deleteWork(id: Long)

    @Query("DELETE FROM works")
    suspend fun deleteAllWorks()

    @Query("SELECT COUNT(*) FROM works WHERE rowDeletedAt IS NULL")
    suspend fun getWorkCount(): Int
}

@Dao
interface ChapterDao {
    @Query("SELECT * FROM chapters WHERE workId = :workId AND rowDeletedAt IS NULL ORDER BY number ASC")
    fun getChaptersByWork(workId: Long): Flow<List<ChapterEntity>>

    @Query("SELECT * FROM chapters WHERE workId = :workId AND rowDeletedAt IS NULL ORDER BY number ASC")
    suspend fun getChaptersByWorkOnce(workId: Long): List<ChapterEntity>

    @Query("SELECT * FROM chapters WHERE rowDeletedAt IS NULL ORDER BY workId, number ASC")
    suspend fun getAllChaptersOnce(): List<ChapterEntity>

    @Query("SELECT * FROM chapters ORDER BY workId, number ASC")
    suspend fun getAllChaptersIncludingDeletedOnce(): List<ChapterEntity>

    @Query("SELECT * FROM chapters WHERE workId IN (:workIds) AND rowDeletedAt IS NULL ORDER BY workId, number ASC")
    suspend fun getChaptersByWorkIds(workIds: List<Long>): List<ChapterEntity>

    @Query("SELECT * FROM chapters WHERE chapterId = :chapterId AND workId = :workId AND rowDeletedAt IS NULL")
    suspend fun getChapterById(chapterId: Long, workId: Long): ChapterEntity?

    @Query("SELECT * FROM chapters WHERE chapterId = :chapterId AND workId = :workId")
    suspend fun getChapterByIdIncludingDeleted(chapterId: Long, workId: Long): ChapterEntity?

    @Query("SELECT * FROM chapters WHERE workId = :workId AND number = :number AND rowDeletedAt IS NULL")
    suspend fun getChapterByWorkAndNumber(workId: Long, number: Int): ChapterEntity?

    @Upsert
    suspend fun upsertChapter(chapter: ChapterEntity)

    @Upsert
    suspend fun upsertChapters(chapters: List<ChapterEntity>)

    @Query("UPDATE chapters SET readProgress = :progress, lastReadAt = :lastReadAt, rowUpdatedAt = :rowUpdatedAt WHERE chapterId = :chapterId AND workId = :workId")
    suspend fun updateChapterProgress(chapterId: Long, workId: Long, progress: Float, lastReadAt: Long, rowUpdatedAt: Long)

    @Query("UPDATE chapters SET markedCompleteAt = :markedCompleteAt, rowUpdatedAt = :rowUpdatedAt WHERE chapterId = :chapterId AND workId = :workId")
    suspend fun markChapterComplete(chapterId: Long, workId: Long, markedCompleteAt: Long, rowUpdatedAt: Long)

    @Query("UPDATE chapters SET readProgress = 1.0, lastReadAt = :lastReadAt, markedCompleteAt = :markedCompleteAt, rowUpdatedAt = :rowUpdatedAt WHERE chapterId = :chapterId AND workId = :workId")
    suspend fun markChapterAsRead(chapterId: Long, workId: Long, lastReadAt: Long, markedCompleteAt: Long, rowUpdatedAt: Long)

    @Query("UPDATE chapters SET readProgress = 1.0, lastReadAt = :lastReadAt, markedCompleteAt = :markedCompleteAt, rowUpdatedAt = :rowUpdatedAt WHERE workId = :workId AND rowDeletedAt IS NULL")
    suspend fun markAllChaptersAsRead(workId: Long, lastReadAt: Long, markedCompleteAt: Long, rowUpdatedAt: Long)

    @Query("UPDATE chapters SET readProgress = NULL, lastReadAt = NULL, markedCompleteAt = NULL, rowUpdatedAt = :rowUpdatedAt WHERE chapterId = :chapterId AND workId = :workId")
    suspend fun markChapterAsUnread(chapterId: Long, workId: Long, rowUpdatedAt: Long)

    @Query("UPDATE chapters SET readProgress = NULL, lastReadAt = NULL, markedCompleteAt = NULL, rowUpdatedAt = :rowUpdatedAt WHERE workId = :workId AND rowDeletedAt IS NULL")
    suspend fun markAllChaptersAsUnread(workId: Long, rowUpdatedAt: Long)

    @Query("UPDATE chapters SET rowDeletedAt = :rowDeletedAt, rowUpdatedAt = :rowUpdatedAt WHERE chapterId = :chapterId AND workId = :workId")
    suspend fun softDeleteChapter(chapterId: Long, workId: Long, rowDeletedAt: Long, rowUpdatedAt: Long)

    @Query("DELETE FROM chapters WHERE chapterId = :chapterId AND workId = :workId")
    suspend fun deleteChapter(chapterId: Long, workId: Long)

    @Query("DELETE FROM chapters WHERE workId = :workId")
    suspend fun deleteChaptersByWork(workId: Long)

    @Query("SELECT * FROM chapters WHERE workId = :workId AND rowDeletedAt IS NULL ORDER BY number DESC LIMIT 1")
    suspend fun getLatestChapterForWork(workId: Long): ChapterEntity?

    @Query("DELETE FROM chapters")
    suspend fun deleteAllChapters()
}

@Dao
interface TagDao {
    @Query("SELECT * FROM tags WHERE workId = :workId")
    fun getTagsByWork(workId: Long): Flow<List<TagEntity>>

    @Query("SELECT * FROM tags WHERE workId = :workId")
    suspend fun getTagsByWorkOnce(workId: Long): List<TagEntity>

    @Query("SELECT * FROM tags WHERE workId IN (:workIds)")
    suspend fun getTagsByWorkIds(workIds: List<Long>): List<TagEntity>

    @Query("SELECT * FROM tags WHERE workId = :workId AND typeId = :typeId")
    suspend fun getTagsByWorkAndType(workId: Long, typeId: Int): List<TagEntity>

    @Query("""
        SELECT DISTINCT t.tag FROM tags t
        INNER JOIN works w ON t.workId = w.id
        WHERE t.typeId = :typeId AND w.rowDeletedAt IS NULL
        ORDER BY t.tag ASC
    """)
    fun getDistinctTagsByType(typeId: Int): Flow<List<String>>

    @Query("""
        SELECT DISTINCT w.* FROM works w
        INNER JOIN tags t ON w.id = t.workId
        WHERE t.typeId = :typeId AND t.tag = :tag AND w.rowDeletedAt IS NULL
        ORDER BY w.lastRead DESC
    """)
    fun getWorksByTag(typeId: Int, tag: String): Flow<List<WorkEntity>>

    @Upsert
    suspend fun upsertTag(tag: TagEntity)

    @Upsert
    suspend fun upsertTags(tags: List<TagEntity>)

    @Query("DELETE FROM tags WHERE workId = :workId")
    suspend fun deleteTagsByWork(workId: Long)

    @Query("DELETE FROM tags")
    suspend fun deleteAllTags()
}
