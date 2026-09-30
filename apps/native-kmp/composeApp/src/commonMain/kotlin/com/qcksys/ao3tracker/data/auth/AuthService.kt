package com.qcksys.ao3tracker.data.auth

import com.qcksys.ao3tracker.data.model.AuthError
import com.qcksys.ao3tracker.data.model.PasskeyAuthenticateOptions
import com.qcksys.ao3tracker.data.model.PasskeyRegisterOptions
import com.qcksys.ao3tracker.data.model.PasskeyVerifyRequest
import com.qcksys.ao3tracker.data.model.SessionResponse
import com.qcksys.ao3tracker.data.model.SignInRequest
import com.qcksys.ao3tracker.data.model.SignInResponse
import com.qcksys.ao3tracker.data.model.SignUpRequest
import com.qcksys.ao3tracker.data.model.SignUpResponse
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.util.AppLogger
import com.qcksys.ao3tracker.util.JsonConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.SerializationException

open class AuthService(
    private val appSettings: AppSettings
) {
    private val baseUrl: String
        get() = appSettings.getAuthBaseUrl()

    private val client = HttpClient {
        install(ContentNegotiation) {
            json(JsonConfig.json)
        }
        defaultRequest {
            header(HttpHeaders.UserAgent, "ao3tracker")
        }
    }

    companion object {
        private const val TAG = "AuthService"
    }

    fun getClient(): HttpClient = client

    open suspend fun signIn(email: String, password: String, baseUrl: String = this.baseUrl): Result<SignInResponse> {
        return try {
            val response: HttpResponse = client.post("$baseUrl/sign-in/email") {
                contentType(ContentType.Application.Json)
                setBody(SignInRequest(email, password))
            }

            if (response.status.isSuccess()) {
                Result.success(response.body<SignInResponse>())
            } else {
                Result.failure(Exception(parseAuthErrorMessage(response.bodyAsText(), "Sign in failed")))
            }
        } catch (e: Exception) {
            AppLogger.e("Sign in request failed", TAG, e)
            Result.failure(e)
        }
    }

    suspend fun signUp(name: String, email: String, password: String, baseUrl: String = this.baseUrl): Result<SignUpResponse> {
        return try {
            val response: HttpResponse = client.post("$baseUrl/sign-up/email") {
                contentType(ContentType.Application.Json)
                setBody(SignUpRequest(name, email, password))
            }

            if (response.status.isSuccess()) {
                Result.success(response.body<SignUpResponse>())
            } else {
                Result.failure(Exception(parseAuthErrorMessage(response.bodyAsText(), "Sign up failed")))
            }
        } catch (e: Exception) {
            AppLogger.e("Sign up request failed", TAG, e)
            Result.failure(e)
        }
    }

    /**
     * Decode an `AuthError` JSON body from a failed auth request. Empty bodies
     * (common on 4xx/5xx without a JSON payload) fall back silently; non-JSON
     * bodies are logged at warn so we can spot misbehaving endpoints.
     */
    private fun parseAuthErrorMessage(body: String, fallback: String): String {
        if (body.isBlank()) return fallback
        return try {
            JsonConfig.json.decodeFromString<AuthError>(body).message ?: fallback
        } catch (e: SerializationException) {
            AppLogger.w("Failed to parse auth error response: $body", TAG, e)
            fallback
        }
    }

    open suspend fun getSession(token: String, baseUrl: String = this.baseUrl): Result<SessionResponse> {
        return try {
            val response: HttpResponse = client.get("$baseUrl/get-session") {
                header("Authorization", "Bearer $token")
            }

            if (response.status.isSuccess()) {
                val bodyText = response.bodyAsText()
                // API returns literal "null" string when no session exists
                if (bodyText == "null" || bodyText.isBlank()) {
                    AppLogger.d("No active session", TAG)
                    Result.failure(InvalidSessionException("No active session"))
                } else {
                    val session = JsonConfig.json.decodeFromString<SessionResponse>(bodyText)
                    Result.success(session)
                }
            } else {
                AppLogger.d("Session invalid or expired: ${response.status}", TAG)
                Result.failure(InvalidSessionException("Session invalid or expired"))
            }
        } catch (e: Exception) {
            AppLogger.e("Get session request failed", TAG, e)
            Result.failure(e)
        }
    }

    open suspend fun signOut(token: String, baseUrl: String = this.baseUrl): Result<Unit> {
        return try {
            val response: HttpResponse = client.post("$baseUrl/sign-out") {
                header("Authorization", "Bearer $token")
            }

            if (response.status.isSuccess()) {
                Result.success(Unit)
            } else {
                AppLogger.w("Sign out failed with status: ${response.status}", TAG)
                Result.failure(Exception("Sign out failed"))
            }
        } catch (e: Exception) {
            AppLogger.e("Sign out request failed", TAG, e)
            Result.failure(e)
        }
    }

    // Passkey methods
    suspend fun getPasskeyRegisterOptions(token: String): Result<PasskeyRegisterOptions> {
        return try {
            val response: HttpResponse = client.get("$baseUrl/passkey/generate-register-options") {
                header("Authorization", "Bearer $token")
            }

            if (response.status.isSuccess()) {
                Result.success(response.body<PasskeyRegisterOptions>())
            } else {
                AppLogger.w("Failed to get passkey registration options: ${response.status}", TAG)
                Result.failure(Exception("Failed to get passkey registration options"))
            }
        } catch (e: Exception) {
            AppLogger.e("Get passkey register options request failed", TAG, e)
            Result.failure(e)
        }
    }

    suspend fun verifyPasskeyRegistration(token: String, credentialResponse: String, name: String? = null): Result<Unit> {
        return try {
            val response: HttpResponse = client.post("$baseUrl/passkey/verify-registration") {
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(PasskeyVerifyRequest(response = credentialResponse, name = name))
            }

            if (response.status.isSuccess()) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(parseAuthErrorMessage(response.bodyAsText(), "Passkey registration failed")))
            }
        } catch (e: Exception) {
            AppLogger.e("Verify passkey registration request failed", TAG, e)
            Result.failure(e)
        }
    }

    suspend fun getPasskeyAuthenticateOptions(email: String? = null): Result<PasskeyAuthenticateOptions> {
        return try {
            val url = if (email != null) {
                "$baseUrl/passkey/generate-authenticate-options?email=$email"
            } else {
                "$baseUrl/passkey/generate-authenticate-options"
            }
            val response: HttpResponse = client.get(url)

            if (response.status.isSuccess()) {
                Result.success(response.body<PasskeyAuthenticateOptions>())
            } else {
                AppLogger.w("Failed to get passkey authenticate options: ${response.status}", TAG)
                Result.failure(Exception("Failed to get passkey authentication options"))
            }
        } catch (e: Exception) {
            AppLogger.e("Get passkey authenticate options request failed", TAG, e)
            Result.failure(e)
        }
    }

    suspend fun verifyPasskeyAuthentication(credentialResponse: String, baseUrl: String = this.baseUrl): Result<SessionResponse> {
        return try {
            val response: HttpResponse = client.post("$baseUrl/passkey/verify-authentication") {
                contentType(ContentType.Application.Json)
                setBody(PasskeyVerifyRequest(response = credentialResponse))
            }

            if (response.status.isSuccess()) {
                Result.success(response.body<SessionResponse>())
            } else {
                Result.failure(Exception(parseAuthErrorMessage(response.bodyAsText(), "Passkey authentication failed")))
            }
        } catch (e: Exception) {
            AppLogger.e("Verify passkey authentication request failed", TAG, e)
            Result.failure(e)
        }
    }
}

/**
 * Exception thrown when the session is explicitly invalid (not a network error).
 * Only this exception should trigger token clearing.
 */
class InvalidSessionException(message: String) : Exception(message)
