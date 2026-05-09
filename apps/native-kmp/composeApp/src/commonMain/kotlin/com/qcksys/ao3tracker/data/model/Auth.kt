package com.qcksys.ao3tracker.data.model

import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: String,
    val name: String,
    val email: String,
    val emailVerified: Boolean,
    val image: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val twoFactorEnabled: Boolean? = null
)

@Serializable
data class Session(
    val id: String,
    val token: String,
    val expiresAt: String,
    val createdAt: String,
    val updatedAt: String,
    val userId: String,
    val ipAddress: String? = null,
    val userAgent: String? = null
)

// Response from /get-session
@Serializable
data class SessionResponse(
    val session: Session,
    val user: User
)

// Response from /sign-in/email
@Serializable
data class SignInResponse(
    val token: String,
    val user: User,
    val redirect: Boolean = false,
    val url: String? = null
)

// Response from /sign-up/email
@Serializable
data class SignUpResponse(
    val token: String? = null,
    val user: User
)

@Serializable
data class SignInRequest(
    val email: String,
    val password: String
)

@Serializable
data class SignUpRequest(
    val name: String,
    val email: String,
    val password: String
)

@Serializable
data class AuthError(
    val message: String? = null
)

// Passkey models
@Serializable
data class PasskeyRegisterOptions(
    val challenge: String,
    val rp: RelyingParty,
    val user: PasskeyUser,
    val pubKeyCredParams: List<PubKeyCredParam>,
    val timeout: Long? = null,
    val excludeCredentials: List<CredentialDescriptor>? = null,
    val authenticatorSelection: AuthenticatorSelection? = null,
    val attestation: String? = null
)

@Serializable
data class PasskeyAuthenticateOptions(
    val challenge: String,
    val rpId: String? = null,
    val timeout: Long? = null,
    val allowCredentials: List<CredentialDescriptor>? = null,
    val userVerification: String? = null
)

@Serializable
data class RelyingParty(
    val name: String,
    val id: String? = null
)

@Serializable
data class PasskeyUser(
    val id: String,
    val name: String,
    val displayName: String
)

@Serializable
data class PubKeyCredParam(
    val type: String,
    val alg: Int
)

@Serializable
data class CredentialDescriptor(
    val type: String,
    val id: String,
    val transports: List<String>? = null
)

@Serializable
data class AuthenticatorSelection(
    val authenticatorAttachment: String? = null,
    val residentKey: String? = null,
    val requireResidentKey: Boolean? = null,
    val userVerification: String? = null
)

@Serializable
data class PasskeyVerifyRequest(
    val response: String,
    val name: String? = null
)

sealed class AuthState {
    data object Idle : AuthState()
    data object Loading : AuthState()
    data class Authenticated(val user: User?, val token: String) : AuthState()
    data class Error(val message: String) : AuthState()
}
