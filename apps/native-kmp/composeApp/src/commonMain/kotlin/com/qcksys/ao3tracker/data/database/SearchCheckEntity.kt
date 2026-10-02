package com.qcksys.ao3tracker.data.database

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Entity(
    tableName = "search_check",
    foreignKeys = [ForeignKey(
        entity = SavedSearchEntity::class,
        parentColumns = ["id"],
        childColumns = ["searchId"],
        onDelete = ForeignKey.CASCADE
    )]
)
data class SearchCheckEntity(
    @PrimaryKey val searchId: String,
    val url: String,
    val context: String,
    val worksJson: String,
    val checkedAt: Long,
    val previousCheckedAt: Long?,
    val newWorks: Int,
    val updatedWorks: Int,
    val lastViewedAt: Long? = null,
    @ColumnInfo(defaultValue = "'{}'") val changesJson: String = "{}",
    @ColumnInfo(defaultValue = "0") val attemptedAt: Long = 0,
    @ColumnInfo(defaultValue = "0") val partial: Boolean = false,
    @ColumnInfo(defaultValue = "1") val fullSnapshot: Boolean = true,
    val resumeUrl: String? = null,
    val scanStartedAt: Long? = null
)

@Dao
interface SearchCheckDao {
    @Query("SELECT * FROM search_check")
    fun observeAll(): Flow<List<SearchCheckEntity>>

    @Query("SELECT * FROM search_check WHERE searchId = :id")
    suspend fun getOne(id: String): SearchCheckEntity?

    @Upsert
    suspend fun upsert(check: SearchCheckEntity)
}
