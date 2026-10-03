package com.qcksys.ao3tracker.data.database

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface OfflineDao {
    @Upsert suspend fun enqueueCleanup(entries: List<OfflineCleanupEntity>)
    @Query("SELECT * FROM offline_cleanup") suspend fun pendingCleanup(): List<OfflineCleanupEntity>
    @Query("DELETE FROM offline_cleanup WHERE contextId = :contextId") suspend fun finishCleanup(contextId: String)

    @Query("SELECT * FROM offline_context WHERE selected = 1 LIMIT 1")
    suspend fun selectedContext(): OfflineContextEntity?

    @Query("SELECT * FROM offline_context")
    suspend fun contexts(): List<OfflineContextEntity>

    @Query("SELECT * FROM offline_context WHERE identity = :identity")
    suspend fun contextForIdentity(identity: String): OfflineContextEntity?

    @Query("UPDATE offline_context SET selected = 0")
    suspend fun deselectContexts()

    @Upsert suspend fun saveContext(context: OfflineContextEntity)
    @Upsert suspend fun saveWork(work: OfflineWorkEntity)
    @Upsert suspend fun saveChapter(chapter: OfflineChapterEntity)
    @Upsert suspend fun saveSkin(skin: OfflineSkinEntity)
    @Upsert suspend fun saveResources(resources: List<OfflineResourceEntity>)
    @Upsert suspend fun saveJob(job: OfflineJobEntity)

    @Query("SELECT * FROM offline_work WHERE contextId = :contextId AND workId = :workId")
    suspend fun work(contextId: String, workId: Long): OfflineWorkEntity?

    @Query("SELECT * FROM offline_work WHERE contextId = :contextId")
    suspend fun works(contextId: String): List<OfflineWorkEntity>

    @Query("SELECT * FROM offline_work WHERE contextId IN (SELECT id FROM offline_context WHERE selected = 1)")
    fun observeWorks(): Flow<List<OfflineWorkEntity>>

    @Query("SELECT * FROM offline_chapter WHERE contextId = :contextId AND `key` = :key")
    suspend fun chapter(contextId: String, key: String): OfflineChapterEntity?

    @Query("SELECT * FROM offline_chapter WHERE contextId = :contextId")
    suspend fun chapters(contextId: String): List<OfflineChapterEntity>

    @Query("SELECT * FROM offline_skin WHERE contextId = :contextId AND hash = :hash")
    suspend fun skin(contextId: String, hash: String): OfflineSkinEntity?

    @Query("SELECT * FROM offline_skin WHERE contextId = :contextId")
    suspend fun skins(contextId: String): List<OfflineSkinEntity>

    @Query("SELECT * FROM offline_resource WHERE contextId = :contextId")
    suspend fun resources(contextId: String): List<OfflineResourceEntity>

    @Query("SELECT * FROM offline_job WHERE contextId = :contextId ORDER BY createdAt")
    suspend fun jobs(contextId: String): List<OfflineJobEntity>

    @Query("SELECT * FROM offline_job WHERE id = :id")
    suspend fun job(id: String): OfflineJobEntity?

    @Query("DELETE FROM offline_chapter WHERE contextId = :contextId AND `key` = :key")
    suspend fun deleteChapter(contextId: String, key: String)

    @Query("DELETE FROM offline_chapter WHERE contextId = :contextId AND workId = :workId")
    suspend fun deleteWorkChapters(contextId: String, workId: Long)

    @Query("DELETE FROM offline_work WHERE contextId = :contextId AND workId = :workId")
    suspend fun deleteWork(contextId: String, workId: Long)

    @Query("DELETE FROM offline_job WHERE contextId = :contextId AND workId = :workId")
    suspend fun deleteWorkJobs(contextId: String, workId: Long)

    @Query("DELETE FROM offline_job WHERE contextId = :contextId AND mode = 'prefetch'")
    suspend fun deletePrefetchJobs(contextId: String)

    @Query("DELETE FROM offline_skin WHERE contextId = :contextId AND hash = :hash")
    suspend fun deleteSkin(contextId: String, hash: String)

    @Query("DELETE FROM offline_resource WHERE contextId = :contextId AND hash = :hash")
    suspend fun deleteResource(contextId: String, hash: String)

    @Query("DELETE FROM offline_context") suspend fun deleteContexts()
    @Query("DELETE FROM offline_work") suspend fun deleteWorks()
    @Query("DELETE FROM offline_chapter") suspend fun deleteChapters()
    @Query("DELETE FROM offline_skin") suspend fun deleteSkins()
    @Query("DELETE FROM offline_resource") suspend fun deleteResources()
    @Query("DELETE FROM offline_job") suspend fun deleteJobs()
}
