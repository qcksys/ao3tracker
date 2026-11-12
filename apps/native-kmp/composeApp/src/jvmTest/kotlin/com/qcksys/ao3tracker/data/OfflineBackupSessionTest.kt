package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.offline.OfflineBackupUnavailable
import com.qcksys.ao3tracker.data.offline.backupSessionToken
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class OfflineBackupSessionTest {
    /** A stored session restored while offline: it has a token but no account until it is validated. */
    private class RestoredSession(private val validation: Boolean?) : SyncAuthentication {
        override val authState = MutableStateFlow<AuthState>(AuthState.Authenticated(null, "stored"))
        var owner: String? = null
        var validations = 0
        override fun currentOwner() = owner
        override fun isCurrentSession(token: String, owner: String) = token == "fresh" && this.owner == owner
        override suspend fun invalidateSession() { authState.value = AuthState.Idle }
        override suspend fun prepareSession(): Boolean {
            validations++
            when (validation) {
                true -> { owner = "production:reader"; authState.value = AuthState.Authenticated(null, "fresh") }
                false -> invalidateSession()
                null -> Unit
            }
            return validation == true
        }
    }

    @Test
    fun `a session restored offline is validated before the backup request`() = runBlocking {
        val auth = RestoredSession(validation = true)
        assertEquals("fresh", backupSessionToken(auth, "production:reader"))
        assertEquals(1, auth.validations)
    }

    @Test
    fun `an unreachable server is not reported as a signed-out account`() = runBlocking {
        val error = assertFailsWith<OfflineBackupUnavailable> { backupSessionToken(RestoredSession(validation = null), "production:reader") }
        assertEquals("Your session could not be checked. Check your connection and try again.", error.message)
    }

    @Test
    fun `an expired session or another account asks the reader to sign in`() = runBlocking {
        val expired = assertFailsWith<OfflineBackupUnavailable> { backupSessionToken(RestoredSession(validation = false), "production:reader") }
        assertEquals("Sign in again to download backups.", expired.message)
        val other = assertFailsWith<OfflineBackupUnavailable> { backupSessionToken(RestoredSession(validation = true), "production:other") }
        assertEquals("Sign in to download backups.", other.message)
        val signedOut = RestoredSession(validation = true).apply { authState.value = AuthState.Idle }
        assertFailsWith<OfflineBackupUnavailable> { backupSessionToken(signedOut, "production:reader") }
        assertEquals(0, signedOut.validations)
    }
}
