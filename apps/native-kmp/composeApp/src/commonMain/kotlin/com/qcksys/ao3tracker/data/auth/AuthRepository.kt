package com.qcksys.ao3tracker.data.auth

import com.qcksys.ao3tracker.data.model.AuthState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AuthRepository(
    private val authService: AuthService,
    private val tokenStorage: TokenStorage
) {
    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val credentialHelper: CredentialHelper? = createCredentialHelper()

    private var isInitialized = false

    /**
     * Initialize auth state from stored token.
     * This restores auth state without server validation to avoid logout on server issues.
     * Session validity is checked lazily when making authenticated requests.
     */
    suspend fun initialize() {
        // Skip if already authenticated or currently loading
        val currentState = _authState.value
        if (currentState is AuthState.Authenticated || currentState is AuthState.Loading) {
            return
        }

        // Skip if already initialized and in Idle state (no token)
        if (isInitialized && currentState is AuthState.Idle) {
            return
        }

        val token = tokenStorage.getToken()
        if (token != null) {
            // Trust the stored token - don't validate with server on every app start
            // This prevents logout when server has session persistence issues
            // Session will be validated when making authenticated requests (e.g., sync)
            _authState.value = AuthState.Authenticated(
                user = null, // User details will be fetched on demand if needed
                token = token
            )
        }

        isInitialized = true
    }

    /**
     * Validate the current session with the server.
     * Call this when you need to verify the session is still valid.
     */
    suspend fun validateSession(): Boolean {
        val currentState = _authState.value
        if (currentState !is AuthState.Authenticated) {
            return false
        }

        return authService.getSession(currentState.token)
            .onSuccess { response ->
                _authState.value = AuthState.Authenticated(response.user, response.session.token)
            }
            .onFailure { error ->
                if (error is InvalidSessionException) {
                    tokenStorage.clearToken()
                    _authState.value = AuthState.Idle
                }
            }
            .isSuccess
    }

    suspend fun signIn(email: String, password: String) {
        _authState.value = AuthState.Loading
        authService.signIn(email, password)
            .onSuccess { response ->
                tokenStorage.saveToken(response.token)
                // Save credential to password manager
                credentialHelper?.savePassword(email, password)
                _authState.value = AuthState.Authenticated(response.user, response.token)
            }
            .onFailure { error ->
                _authState.value = AuthState.Error(error.message ?: "Sign in failed")
            }
    }

    suspend fun signUp(name: String, email: String, password: String) {
        _authState.value = AuthState.Loading
        authService.signUp(name, email, password)
            .onSuccess { response ->
                val token = response.token
                if (token != null) {
                    tokenStorage.saveToken(token)
                    // Save credential to password manager
                    credentialHelper?.savePassword(email, password)
                    _authState.value = AuthState.Authenticated(response.user, token)
                } else {
                    // Sign up succeeded but no token (email verification required?)
                    _authState.value = AuthState.Error("Account created. Please check your email to verify.")
                }
            }
            .onFailure { error ->
                _authState.value = AuthState.Error(error.message ?: "Sign up failed")
            }
    }

    suspend fun signInWithSavedCredentials(): CredentialResult {
        val helper = credentialHelper ?: return CredentialResult.NotSupported

        // Get passkey options from server (for passkey sign-in)
        val passkeyOptions = authService.getPasskeyAuthenticateOptions()
            .getOrNull()

        val passkeyJson = passkeyOptions?.let {
            // Convert to JSON string for the credential manager
            kotlinx.serialization.json.Json.encodeToString(
                com.qcksys.ao3tracker.data.model.PasskeyAuthenticateOptions.serializer(),
                it
            )
        }

        return when (val result = helper.getCredential(passkeyJson)) {
            is CredentialResult.Password -> {
                // Sign in with the saved password
                signIn(result.credential.email, result.credential.password)
                result
            }
            is CredentialResult.Passkey -> {
                // Sign in with passkey
                _authState.value = AuthState.Loading
                authService.verifyPasskeyAuthentication(result.credential.responseJson)
                    .onSuccess { response ->
                        tokenStorage.saveToken(response.session.token)
                        _authState.value = AuthState.Authenticated(response.user, response.session.token)
                    }
                    .onFailure { error ->
                        _authState.value = AuthState.Error(error.message ?: "Passkey sign in failed")
                    }
                result
            }
            else -> result
        }
    }

    suspend fun registerPasskey(): CredentialResult {
        val helper = credentialHelper ?: return CredentialResult.NotSupported
        val currentState = _authState.value as? AuthState.Authenticated
            ?: return CredentialResult.Error("Must be signed in to register a passkey")

        // Get registration options from server
        val options = authService.getPasskeyRegisterOptions(currentState.token)
            .getOrElse { return CredentialResult.Error(it.message ?: "Failed to get passkey options") }

        val optionsJson = kotlinx.serialization.json.Json.encodeToString(
            com.qcksys.ao3tracker.data.model.PasskeyRegisterOptions.serializer(),
            options
        )

        return when (val result = helper.createPasskey(optionsJson)) {
            is CredentialResult.Passkey -> {
                // Verify registration with server
                authService.verifyPasskeyRegistration(
                    currentState.token,
                    result.credential.responseJson
                ).onFailure {
                    return CredentialResult.Error(it.message ?: "Failed to verify passkey")
                }
                result
            }
            else -> result
        }
    }

    fun hasCredentialSupport(): Boolean = credentialHelper?.isSupported() == true

    suspend fun signOut() {
        val currentState = _authState.value
        if (currentState is AuthState.Authenticated) {
            _authState.value = AuthState.Loading
            authService.signOut(currentState.token)
            tokenStorage.clearToken()
            _authState.value = AuthState.Idle
        }
    }

    fun clearError() {
        if (_authState.value is AuthState.Error) {
            _authState.value = AuthState.Idle
        }
    }

    /**
     * Called when the session is invalidated externally (e.g., token expired during sync).
     * Clears the token and resets auth state.
     */
    fun invalidateSession() {
        tokenStorage.clearToken()
        _authState.value = AuthState.Idle
        isInitialized = false // Allow re-initialization on next attempt
    }
}
