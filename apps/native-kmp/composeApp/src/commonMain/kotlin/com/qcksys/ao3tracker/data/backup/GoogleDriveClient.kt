package com.qcksys.ao3tracker.data.backup

import com.qcksys.ao3tracker.util.JsonConfig
import io.ktor.client.HttpClient
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

enum class DriveBackupLocation(val scope: String) {
    /** A visible file in the user's My Drive; the app can only see files it created. */
    MY_DRIVE("https://www.googleapis.com/auth/drive.file"),

    /** Drive's hidden application data folder. */
    APP_DATA("https://www.googleapis.com/auth/drive.appdata")
}

@Serializable
data class DriveBackupFile(
    val id: String,
    val name: String,
    val modifiedTime: String? = null,
    val appProperties: Map<String, String> = emptyMap()
) {
    val deviceId: String? get() = appProperties[PROPERTY_DEVICE]
    val library: String? get() = appProperties[PROPERTY_LIBRARY]

    companion object {
        const val PROPERTY_BACKUP = "ao3trackerBackup"
        const val PROPERTY_DEVICE = "ao3trackerDevice"
        const val PROPERTY_LIBRARY = "ao3trackerLibrary"
    }
}

class DriveUnauthorizedException : Exception("Google Drive access has expired")

class DriveRequestException(val status: Int, message: String) : Exception(message)

/** The Drive operations backups use; [GoogleDriveClient] implements them over the REST API. */
interface DriveFiles {
    suspend fun accountEmail(token: String): String
    suspend fun list(token: String, location: DriveBackupLocation): List<DriveBackupFile>
    suspend fun upload(
        token: String,
        location: DriveBackupLocation,
        existing: DriveBackupFile?,
        name: String,
        properties: Map<String, String>,
        content: String
    ): DriveBackupFile
    suspend fun download(token: String, fileId: String): String
}

@Serializable
private data class DriveAbout(val user: DriveUser)

@Serializable
private data class DriveUser(val emailAddress: String)

@Serializable
private data class DriveFileList(val files: List<DriveBackupFile> = emptyList())

@Serializable
private data class DriveErrorResponse(val error: DriveError? = null)

@Serializable
private data class DriveError(val message: String? = null)

class GoogleDriveClient(
    private val client: HttpClient,
    private val baseUrl: String = "https://www.googleapis.com"
) : DriveFiles {
    override suspend fun accountEmail(token: String): String {
        val response = send(token, HttpMethod.Get, "$baseUrl/drive/v3/about") {
            parameter("fields", "user(emailAddress)")
        }
        return JsonConfig.json.decodeFromString(DriveAbout.serializer(), response.bodyAsText()).user.emailAddress
    }

    override suspend fun list(token: String, location: DriveBackupLocation): List<DriveBackupFile> {
        val response = send(token, HttpMethod.Get, "$baseUrl/drive/v3/files") {
            parameter("spaces", if (location == DriveBackupLocation.APP_DATA) "appDataFolder" else "drive")
            parameter("q", "appProperties has { key='${DriveBackupFile.PROPERTY_BACKUP}' and value='1' } and trashed = false")
            parameter("fields", "files($FILE_FIELDS)")
            parameter("orderBy", "modifiedTime desc")
            parameter("pageSize", 100)
        }
        return JsonConfig.json.decodeFromString(DriveFileList.serializer(), response.bodyAsText()).files
    }

    // Resumable uploads have no 5 MB limit, unlike multipart uploads.
    override suspend fun upload(
        token: String,
        location: DriveBackupLocation,
        existing: DriveBackupFile?,
        name: String,
        properties: Map<String, String>,
        content: String
    ): DriveBackupFile {
        val metadata = buildJsonObject {
            put("name", name)
            put("mimeType", JSON_TYPE)
            putJsonObject("appProperties") {
                put(DriveBackupFile.PROPERTY_BACKUP, "1")
                properties.forEach { (key, value) -> put(key, value) }
            }
            if (existing == null && location == DriveBackupLocation.APP_DATA) {
                putJsonArray("parents") { add("appDataFolder") }
            }
        }
        val session = send(
            token,
            if (existing == null) HttpMethod.Post else HttpMethod.Patch,
            "$baseUrl/upload/drive/v3/files" + (existing?.let { "/${it.id}" } ?: "")
        ) {
            parameter("uploadType", "resumable")
            parameter("fields", FILE_FIELDS)
            header("X-Upload-Content-Type", JSON_TYPE)
            setBody(TextContent(metadata.toString(), ContentType.Application.Json))
        }
        val uploadUrl = session.headers[HttpHeaders.Location]
            ?: throw DriveRequestException(session.status.value, "Google Drive did not start the upload")
        val uploaded = send(token, HttpMethod.Put, uploadUrl) {
            setBody(TextContent(content, ContentType.Application.Json))
        }
        return JsonConfig.json.decodeFromString(DriveBackupFile.serializer(), uploaded.bodyAsText())
    }

    override suspend fun download(token: String, fileId: String): String =
        send(token, HttpMethod.Get, "$baseUrl/drive/v3/files/$fileId") { parameter("alt", "media") }.bodyAsText()

    private suspend fun send(
        token: String,
        method: HttpMethod,
        url: String,
        block: HttpRequestBuilder.() -> Unit
    ): HttpResponse {
        val response = client.request(url) {
            this.method = method
            bearerAuth(token)
            block()
        }
        if (response.status == HttpStatusCode.Unauthorized) throw DriveUnauthorizedException()
        if (!response.status.isSuccess()) {
            val message = runCatching {
                JsonConfig.json.decodeFromString(DriveErrorResponse.serializer(), response.bodyAsText()).error?.message
            }.getOrNull()
            throw DriveRequestException(response.status.value, message ?: "Google Drive request failed (${response.status.value})")
        }
        return response
    }

    private companion object {
        const val JSON_TYPE = "application/json"
        const val FILE_FIELDS = "id,name,modifiedTime,appProperties"
    }
}
