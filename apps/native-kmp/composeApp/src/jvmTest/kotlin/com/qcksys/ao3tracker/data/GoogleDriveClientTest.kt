package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.backup.DriveBackupFile
import com.qcksys.ao3tracker.data.backup.DriveBackupLocation
import com.qcksys.ao3tracker.data.backup.DriveRequestException
import com.qcksys.ao3tracker.data.backup.DriveUnauthorizedException
import com.qcksys.ao3tracker.data.backup.GoogleDriveClient
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import io.ktor.client.HttpClient
import io.ktor.client.engine.java.Java
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class GoogleDriveClientTest {
    private data class Received(
        val method: String,
        val path: String,
        val query: Map<String, String>,
        val authorization: String?,
        val uploadType: String?,
        val body: String
    )

    private val requests = CopyOnWriteArrayList<Received>()
    private lateinit var server: HttpServer
    private lateinit var origin: String
    private lateinit var client: HttpClient
    private lateinit var drive: GoogleDriveClient

    @BeforeTest
    fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        origin = "http://127.0.0.1:${server.address.port}"
        server.createContext("/") { exchange -> handle(exchange) }
        server.start()
        // The JDK test server is HTTP/1.1; avoid h2c upgrade negotiation on its reused connection.
        client = HttpClient(Java) { engine { config { version(java.net.http.HttpClient.Version.HTTP_1_1) } } }
        drive = GoogleDriveClient(client, origin)
    }

    @AfterTest
    fun stop() {
        client.close()
        server.stop(0)
    }

    @Test
    fun `lists only tracker backups in the selected space with the bearer token`() = runBlocking {
        val files = drive.list("token", DriveBackupLocation.APP_DATA)

        assertEquals(listOf("Backup"), files.map { it.name })
        assertEquals("device", files.single().deviceId)
        assertEquals("guest", files.single().library)
        val request = requests.single()
        assertEquals("Bearer token", request.authorization)
        assertEquals("appDataFolder", request.query["spaces"])
        assertEquals("appProperties has { key='ao3trackerBackup' and value='1' } and trashed = false", request.query["q"])

        drive.list("token", DriveBackupLocation.MY_DRIVE)
        assertEquals("drive", requests.last().query["spaces"])
    }

    @Test
    fun `creates a new backup with a resumable upload into the app data folder`() = runBlocking {
        val file = drive.upload(
            "token", DriveBackupLocation.APP_DATA, existing = null, name = "Backup.json",
            properties = mapOf(DriveBackupFile.PROPERTY_LIBRARY to "guest"), content = """{"version":1}"""
        )

        assertEquals("created", file.id)
        val (start, upload) = requests
        assertEquals("POST", start.method)
        assertEquals("/upload/drive/v3/files", start.path)
        assertEquals("resumable", start.query["uploadType"])
        assertEquals("application/json", start.uploadType)
        val metadata = Json.parseToJsonElement(start.body).jsonObject
        assertEquals("Backup.json", metadata.getValue("name").jsonPrimitive.content)
        assertEquals("appDataFolder", metadata.getValue("parents").jsonArray.single().jsonPrimitive.content)
        val properties = metadata.getValue("appProperties").jsonObject
        assertEquals("1", properties.getValue(DriveBackupFile.PROPERTY_BACKUP).jsonPrimitive.content)
        assertEquals("guest", properties.getValue(DriveBackupFile.PROPERTY_LIBRARY).jsonPrimitive.content)
        assertEquals("PUT", upload.method)
        assertEquals("""{"version":1}""", upload.body)
        assertEquals("Bearer token", upload.authorization)
    }

    @Test
    fun `updates an existing backup in place without moving it`() = runBlocking {
        val existing = DriveBackupFile(id = "abc", name = "Old.json")

        drive.upload("token", DriveBackupLocation.MY_DRIVE, existing, "New.json", emptyMap(), "content")

        val (start, upload) = requests
        assertEquals("PATCH", start.method)
        assertEquals("/upload/drive/v3/files/abc", start.path)
        assertNull(Json.parseToJsonElement(start.body).jsonObject["parents"])
        assertEquals("content", upload.body)
    }

    @Test
    fun `reads the account email and downloads backup content`() = runBlocking {
        assertEquals("reader@example.com", drive.accountEmail("token"))
        assertEquals("backup content", drive.download("token", "abc"))
        assertEquals("media", requests.last().query["alt"])
    }

    @Test
    fun `reports expired tokens separately from other failures`() = runBlocking {
        assertFailsWith<DriveUnauthorizedException> { drive.download("token", "expired") }
        val error = assertFailsWith<DriveRequestException> { drive.download("token", "forbidden") }
        assertEquals(403, error.status)
        assertEquals("Rate limit exceeded", error.message)
    }

    private fun handle(exchange: HttpExchange) {
        val path = exchange.requestURI.path
        val query = exchange.requestURI.rawQuery.orEmpty().split('&').filter { it.isNotEmpty() }.associate {
            val (key, value) = it.split('=', limit = 2) + ""
            URLDecoder.decode(key, Charsets.UTF_8) to URLDecoder.decode(value, Charsets.UTF_8)
        }
        requests.add(Received(
            exchange.requestMethod,
            path,
            query,
            exchange.requestHeaders.getFirst("Authorization"),
            exchange.requestHeaders.getFirst("X-Upload-Content-Type"),
            exchange.requestBody.bufferedReader().readText()
        ))
        when {
            path == "/drive/v3/about" -> respond(exchange, 200, """{"user":{"emailAddress":"reader@example.com"}}""")
            path == "/drive/v3/files" -> respond(
                exchange, 200,
                """{"files":[{"id":"1","name":"Backup","modifiedTime":"2026-01-01T00:00:00Z",""" +
                    """"appProperties":{"ao3trackerBackup":"1","ao3trackerDevice":"device","ao3trackerLibrary":"guest"}}]}"""
            )
            path.startsWith("/upload/drive/v3/files") -> {
                exchange.responseHeaders.add("Location", "$origin/session${path.removePrefix("/upload/drive/v3/files")}")
                respond(exchange, 200, "")
            }
            path.startsWith("/session") -> {
                val id = path.removePrefix("/session").removePrefix("/").ifEmpty { "created" }
                respond(exchange, 200, """{"id":"$id","name":"Backup.json"}""")
            }
            path == "/drive/v3/files/expired" -> respond(exchange, 401, "{}")
            path == "/drive/v3/files/forbidden" -> respond(exchange, 403, """{"error":{"message":"Rate limit exceeded"}}""")
            path == "/drive/v3/files/abc" -> respond(exchange, 200, "backup content")
            else -> respond(exchange, 404, "{}")
        }
    }

    private fun respond(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray()
        exchange.sendResponseHeaders(status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
        exchange.responseBody.use { if (bytes.isNotEmpty()) it.write(bytes) }
    }
}
