package com.qcksys.ao3tracker.data.sync

import com.qcksys.ao3tracker.data.auth.AuthService
import com.qcksys.ao3tracker.data.model.SyncGetResponse
import com.qcksys.ao3tracker.data.model.SyncPostRequest
import com.qcksys.ao3tracker.data.model.SyncPostResponse
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.util.AppLogger
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess

interface SyncRemote {
    suspend fun fetchSyncData(token: String, lastSyncedAt: String? = null, workCursor: Long? = null, limit: Int? = null): Result<SyncGetResponse>
    suspend fun sendSyncData(token: String, request: SyncPostRequest): Result<SyncPostResponse>
}

class SyncService(
    private val appSettings: AppSettings,
    private val authService: AuthService
) : SyncRemote {
    private val baseUrl: String
        get() = appSettings.getApiBaseUrl()

    private val client get() = authService.getClient()

    companion object {
        private const val TAG = "SyncService"
    }

    /**
     * Fetches server sync data via GET request.
     * Uses Bearer token authentication.
     *
     * @param token Session token for authentication
     * @param lastSyncedAt Timestamp of last sync for incremental sync (null for full sync)
     * @param workCursor Pagination cursor for works (chapters are not paginated - all chapters for returned works are included)
     * @param limit Max works per page (default: 50, max: 50)
     * @return Result containing the sync response or an error
     */
    override suspend fun fetchSyncData(
        token: String,
        lastSyncedAt: String?,
        workCursor: Long?,
        limit: Int?
    ): Result<SyncGetResponse> {
        return try {
            AppLogger.d("Fetching sync data from $baseUrl/track/sync", TAG)

            val response: HttpResponse = client.get("$baseUrl/track/sync") {
                header("Authorization", "Bearer $token")
                lastSyncedAt?.let { parameter("lastSyncedAt", it) }
                workCursor?.let { parameter("workCursor", it) }
                limit?.let { parameter("limit", it) }
            }

            when {
                response.status.isSuccess() -> {
                    AppLogger.d("Sync GET request successful", TAG)
                    Result.success(response.body<SyncGetResponse>())
                }
                response.status == HttpStatusCode.Unauthorized -> {
                    AppLogger.w("Sync GET failed: Unauthorized (401)", TAG)
                    Result.failure(UnauthorizedException("Authentication required"))
                }
                else -> {
                    val errorBody = response.bodyAsText()
                    AppLogger.e("Sync GET failed with status ${response.status}: $errorBody", TAG)
                    Result.failure(SyncException("Sync failed: $errorBody"))
                }
            }
        } catch (e: Exception) {
            AppLogger.e("Sync GET network error: ${e.message}", TAG, e)
            Result.failure(SyncException("Network error: ${e.message}", e))
        }
    }

    /**
     * Sends local sync data to server via POST request.
     * Uses Bearer token authentication.
     *
     * @param token Session token for authentication
     * @param request The sync request containing local changes to send
     * @return Result containing the sync response or an error
     */
    override suspend fun sendSyncData(token: String, request: SyncPostRequest): Result<SyncPostResponse> {
        return try {
            AppLogger.d("Sending sync data to $baseUrl/track/sync", TAG)

            val response: HttpResponse = client.post("$baseUrl/track/sync") {
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(request)
            }

            when {
                response.status.isSuccess() -> {
                    AppLogger.d("Sync POST request successful", TAG)
                    Result.success(response.body<SyncPostResponse>())
                }
                response.status == HttpStatusCode.Unauthorized -> {
                    AppLogger.w("Sync POST failed: Unauthorized (401)", TAG)
                    Result.failure(UnauthorizedException("Authentication required"))
                }
                else -> {
                    val errorBody = response.bodyAsText()
                    AppLogger.e("Sync POST failed with status ${response.status}: $errorBody", TAG)
                    Result.failure(SyncException("Sync failed: $errorBody"))
                }
            }
        } catch (e: Exception) {
            AppLogger.e("Sync POST network error: ${e.message}", TAG, e)
            Result.failure(SyncException("Network error: ${e.message}", e))
        }
    }
}

class UnauthorizedException(message: String) : Exception(message)
class SyncException(message: String, cause: Throwable? = null) : Exception(message, cause)
