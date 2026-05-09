package com.qcksys.ao3tracker.data.auth

data class PasswordCredential(
    val email: String,
    val password: String
)

data class PasskeyCredential(
    val responseJson: String
)

sealed class CredentialResult {
    data class Password(val credential: PasswordCredential) : CredentialResult()
    data class Passkey(val credential: PasskeyCredential) : CredentialResult()
    data class Error(val message: String) : CredentialResult()
    data object Cancelled : CredentialResult()
    data object NotSupported : CredentialResult()
}

sealed class SaveCredentialResult {
    data object Success : SaveCredentialResult()
    data class Error(val message: String) : SaveCredentialResult()
    data object NotSupported : SaveCredentialResult()
    /** No credential provider is configured on the device */
    data object NoProviderAvailable : SaveCredentialResult()
}

interface CredentialHelper {
    suspend fun getCredential(
        passkeyRequestJson: String? = null
    ): CredentialResult

    suspend fun savePassword(
        email: String,
        password: String
    ): SaveCredentialResult

    suspend fun createPasskey(
        requestJson: String
    ): CredentialResult

    fun isSupported(): Boolean
}

expect fun createCredentialHelper(): CredentialHelper?
