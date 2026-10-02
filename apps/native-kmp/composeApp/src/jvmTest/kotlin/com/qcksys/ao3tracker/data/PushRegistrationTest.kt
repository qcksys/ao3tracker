package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.auth.AuthService
import com.qcksys.ao3tracker.data.auth.SessionTokenStorage
import com.qcksys.ao3tracker.data.model.SignInResponse
import com.qcksys.ao3tracker.data.model.User
import com.qcksys.ao3tracker.data.push.NotificationPreferences
import com.qcksys.ao3tracker.data.push.PushRepository
import com.qcksys.ao3tracker.data.push.PushTokenService
import com.qcksys.ao3tracker.data.push.PushTokenStore
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.ApiEnvironment
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class PushRegistrationTest {
    @Test
    fun loggingOutRetainsDeviceTokenForNextAccountRegistration() = runTest {
        verifyLogoutAndRegistration("device-fcm-token")
    }

    @Test
    fun missingLocalTokenIsRecoveredBeforeRegistration() = runTest {
        verifyLogoutAndRegistration(null)
    }

    @Test
    fun tokenFetchCannotRegisterAnAccountOrEnvironmentThatChangedWhileWaiting() = runTest {
        verifyLogoutAndRegistration(null, changeAccount = true)
        verifyLogoutAndRegistration(null, changeEnvironment = true)
    }

    private suspend fun verifyLogoutAndRegistration(initialToken: String?, changeAccount: Boolean = false, changeEnvironment: Boolean = false) {
        val directory = Files.createTempDirectory("ao3tracker-push-test-")
        val accounts = createTestAccounts(directory)
        val settings = AppSettings(null, canSelectApiEnvironment = true)
        val service = object : AuthService(settings) {
            override suspend fun signIn(email: String, password: String, baseUrl: String) =
                Result.success(SignInResponse("token-$email", User(email, email, email, true, createdAt = "2026-01-01", updatedAt = "2026-01-01")))
            override suspend fun signOut(token: String, baseUrl: String) = Result.success(Unit)
        }
        val auth = AuthRepository(service, object : SessionTokenStorage {
            private var token: String? = null
            override fun getToken() = token
            override fun saveToken(token: String) { this.token = token }
            override fun clearToken() { token = null }
        }, accounts, settings)
        val registered = mutableListOf<Pair<String, String>>()
        val unregistered = mutableListOf<Pair<String, String>>()
        val remote = object : PushTokenService(settings, service) {
            override suspend fun registerToken(fcmToken: String, platform: String, deviceId: String, authToken: String, preferences: NotificationPreferences): Result<Unit> {
                registered.add(fcmToken to authToken)
                return Result.success(Unit)
            }
            override suspend fun unregisterToken(deviceId: String, authToken: String): Result<Unit> {
                unregistered.add(deviceId to authToken)
                return Result.success(Unit)
            }
        }
        val storage = object : PushTokenStore {
            var token: String? = initialToken
            var fetches = 0
            override suspend fun fetchFcmToken(): String? {
                fetches++
                if (changeAccount) auth.signIn("other", "password")
                if (changeEnvironment) settings.setApiEnvironment(ApiEnvironment.DEV)
                token = "device-fcm-token"
                return token
            }
            override fun getFcmToken() = token
            override fun saveFcmToken(token: String) { this.token = token }
            override fun clearFcmToken() { token = null }
            override fun getDeviceId() = "device"
            override fun getPlatform() = "android"
        }
        val push = PushRepository(remote, storage, auth, settings)
        try {
            accounts.initialize()
            auth.signIn("first", "password")
            val firstRegistration = push.registerTokenIfNeeded()
            if (changeAccount || changeEnvironment) {
                assertTrue(firstRegistration.isFailure)
                assertTrue(registered.isEmpty())
                return
            }
            firstRegistration.getOrThrow()
            push.unregisterToken().getOrThrow()
            auth.signOut()
            assertEquals("device-fcm-token", storage.getFcmToken())
            push.registerTokenIfNeeded().getOrThrow()
            assertEquals(1, registered.size)
            auth.signIn("second", "password")
            push.registerTokenIfNeeded().getOrThrow()
            assertEquals(listOf("device" to "token-first"), unregistered)
            assertEquals(listOf("device-fcm-token" to "token-first", "device-fcm-token" to "token-second"), registered)
            assertEquals(if (initialToken == null) 1 else 0, storage.fetches)
        } finally {
            service.getClient().close()
            accounts.close()
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }
}
