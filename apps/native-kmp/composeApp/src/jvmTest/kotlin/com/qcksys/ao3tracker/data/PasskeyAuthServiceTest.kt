package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.auth.AuthService
import com.qcksys.ao3tracker.data.auth.PasskeyCookiesStorage
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.sun.net.httpserver.HttpServer
import io.ktor.client.engine.java.JavaHttpConfig
import io.ktor.http.Cookie
import io.ktor.http.Url
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class PasskeyAuthServiceTest {
    @Test
    fun sendsChallengeCookieObjectPayloadAndOriginForAuthenticationAndRegistration() = runBlocking {
        val requests = CopyOnWriteArrayList<ReceivedRequest>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val origin = "http://127.0.0.1:${server.address.port}"
        server.createContext("/auth/passkey/") { exchange ->
            val path = exchange.requestURI.path
            val body = exchange.requestBody.bufferedReader().readText()
            requests.add(ReceivedRequest(path, exchange.requestHeaders.getFirst("Cookie"), body, exchange.requestHeaders.getFirst("Origin")))
            val response = if (path.endsWith("generate-authenticate-options")) {
                exchange.responseHeaders.add("Set-Cookie", "better-auth.better-auth-passkey=challenge; Path=/; HttpOnly")
                exchange.responseHeaders.add("Set-Cookie", "better-auth.session_token=old-account; Path=/; HttpOnly")
                """{"challenge":"challenge","rpId":"127.0.0.1"}"""
            } else {
                if (path.endsWith("verify-authentication")) SESSION else "{}"
            }
            exchange.responseHeaders.add("Content-Type", "application/json")
            val bytes = response.toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        val service = AuthService(AppSettings(null))
        try {
            // The JDK test server is HTTP/1.1; avoid h2c upgrade negotiation on its reused connection.
            assertIs<JavaHttpConfig>(service.getClient().engine.config).config { version(java.net.http.HttpClient.Version.HTTP_1_1) }
            withTimeout(10_000) {
                assertTrue(service.getPasskeyAuthenticateOptions(baseUrl = "$origin/auth").isSuccess)
                val credential = """{"id":"credential","type":"public-key","response":{"clientDataJSON":"encoded"}}"""
                val signedIn = service.verifyPasskeyAuthentication(credential, "$origin/auth").getOrThrow()
                assertEquals("new-token", signedIn.session.token)
                service.verifyPasskeyRegistration("new-token", credential, "Phone", "$origin/auth").getOrThrow()
                val verifications = requests.filter { it.path.contains("verify-") }
                assertEquals(2, verifications.size)
                for ((_, cookie, body, requestOrigin) in verifications) {
                    assertEquals(origin, requestOrigin)
                    assertTrue(cookie.orEmpty().contains("better-auth.better-auth-passkey=challenge"))
                    assertFalse(cookie.orEmpty().contains("session_token"))
                    val payload = Json.parseToJsonElement(body).jsonObject
                    assertIs<JsonObject>(payload["response"])
                    assertEquals("credential", payload["response"]!!.jsonObject["id"]!!.jsonPrimitive.content)
                }
                assertEquals("Phone", Json.parseToJsonElement(verifications.last().body).jsonObject["name"]!!.jsonPrimitive.content)
            }
        } finally {
            service.getClient().close()
            server.stop(0)
        }
    }

    @Test
    fun challengeCookiesStayOnTheirHostAndPasskeyRoutes() = runBlocking {
        val storage = PasskeyCookiesStorage()
        val url = Url("https://ao3tracker.com/auth/passkey/generate-authenticate-options")
        storage.addCookie(url, Cookie("__Secure-better-auth.better-auth-passkey", "challenge", path = "/", secure = true))
        storage.addCookie(url, Cookie("__Secure-better-auth.session_token", "old-account", path = "/", secure = true))
        assertEquals(1, storage.get(Url("https://ao3tracker.com/auth/passkey/verify-authentication")).size)
        assertTrue(storage.get(Url("https://dev.ao3tracker.com/auth/passkey/verify-authentication")).isEmpty())
        assertTrue(storage.get(Url("https://ao3tracker.com/auth/get-session")).isEmpty())
        storage.close()
    }

    private data class ReceivedRequest(val path: String, val cookie: String?, val body: String, val origin: String?)

    companion object {
        private const val SESSION = """{"session":{"id":"session","token":"new-token","expiresAt":"2027-01-01T00:00:00Z","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","userId":"user"},"user":{"id":"user","name":"Reader","email":"reader@example.com","emailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}"""
    }
}
