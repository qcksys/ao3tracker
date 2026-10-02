package com.qcksys.ao3tracker.data.auth

import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.ApiEnvironment
import com.qcksys.ao3tracker.data.model.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

interface SyncAuthentication {
    val authState: StateFlow<AuthState>
    fun currentOwner(): String?
    fun isCurrentSession(token: String, owner: String): Boolean
    suspend fun invalidateSession()
    suspend fun prepareSession(): Boolean = true
}

class AuthRepository(
    private val authService: AuthService,
    private val tokenStorage: SessionTokenStorage,
    private val accountData: AccountDataStore,
    private val appSettings: AppSettings
) : SyncAuthentication {
    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    override val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val credentialHelper: CredentialHelper? = createCredentialHelper()

    private var isInitialized = false
    private val authMutex = Mutex()
    private var authGeneration = 0L

    private data class AuthOperation(val generation: Long, val environment: ApiEnvironment)

    private suspend fun beginOperation(loading: Boolean = true): AuthOperation = authMutex.withLock {
        authGeneration++
        if (loading) _authState.value = AuthState.Loading
        AuthOperation(authGeneration, appSettings.apiEnvironment.value)
    }

    private fun isCurrent(operation: AuthOperation): Boolean =
        operation.generation == authGeneration && operation.environment == appSettings.apiEnvironment.value

    private suspend fun complete(operation: AuthOperation, action: suspend () -> Unit): Boolean = authMutex.withLock {
        if (!isCurrent(operation)) return@withLock false
        action()
        true
    }

    private suspend fun acceptSession(operation: AuthOperation, user: User, token: String, claimLegacy: Boolean = false): Boolean = complete(operation) {
        accountData.activate(AccountDataStore.owner(operation.environment.name, user.id), claimLegacy)
        if (isCurrent(operation)) {
            tokenStorage.saveToken(token)
            _authState.value = AuthState.Authenticated(user, token)
        }
    }

    /**
     * Initialize auth state from stored token.
     * Keep the stored token on network failures, but resolve its owner before syncing.
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

        val operation = beginOperation(loading = false)
        accountData.initialize()
        val token = tokenStorage.getToken()
        if (token != null) {
            if (!complete(operation) { _authState.value = AuthState.Authenticated(null, token) }) return
            authService.getSession(token, operation.environment.authBaseUrl).onSuccess { response ->
                acceptSession(operation, response.user, response.session.token, claimLegacy = true)
            }
        } else {
            complete(operation) { accountData.activate(AccountDataStore.GUEST) }
        }

        if (isCurrent(operation)) isInitialized = true
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

        val operation = beginOperation(loading = false)
        return authService.getSession(currentState.token, operation.environment.authBaseUrl)
            .onSuccess { response ->
                acceptSession(operation, response.user, response.session.token, claimLegacy = true)
            }
            .onFailure { error ->
                if (error is InvalidSessionException) {
                    complete(operation) { clearSession() }
                }
            }
            .isSuccess
    }

    suspend fun signIn(email: String, password: String) {
        val operation = beginOperation()
        authService.signIn(email, password, operation.environment.authBaseUrl)
            .onSuccess { response ->
                if (acceptSession(operation, response.user, response.token)) credentialHelper?.savePassword(email, password)
            }
            .onFailure { error ->
                complete(operation) { _authState.value = AuthState.Error(error.message ?: "Sign in failed") }
            }
    }

    suspend fun signUp(name: String, email: String, password: String) {
        val operation = beginOperation()
        authService.signUp(name, email, password, operation.environment.authBaseUrl)
            .onSuccess { response ->
                val token = response.token
                if (token != null) {
                    if (acceptSession(operation, response.user, token)) credentialHelper?.savePassword(email, password)
                } else {
                    // Sign up succeeded but no token (email verification required?)
                    complete(operation) { _authState.value = AuthState.Error("Account created. Please check your email to verify.") }
                }
            }
            .onFailure { error ->
                complete(operation) { _authState.value = AuthState.Error(error.message ?: "Sign up failed") }
            }
    }

    suspend fun signInWithSavedCredentials(): CredentialResult {
        val helper = credentialHelper ?: return CredentialResult.NotSupported
        val operation = beginOperation(loading = false)

        // Get passkey options from server (for passkey sign-in)
        val passkeyOptions = authService.getPasskeyAuthenticateOptions(baseUrl = operation.environment.authBaseUrl)
            .getOrNull()

        val passkeyJson = passkeyOptions?.let {
            // Convert to JSON string for the credential manager
            kotlinx.serialization.json.Json.encodeToString(
                com.qcksys.ao3tracker.data.model.PasskeyAuthenticateOptions.serializer(),
                it
            )
        }

        val result = helper.getCredential(passkeyJson)
        if (!isCurrent(operation)) return CredentialResult.Error("Account or API environment changed")
        return when (result) {
            is CredentialResult.Password -> {
                // Sign in with the saved password
                signIn(result.credential.email, result.credential.password)
                result
            }
            is CredentialResult.Passkey -> {
                // Sign in with passkey
                if (!complete(operation) { _authState.value = AuthState.Loading }) return CredentialResult.Cancelled
                authService.verifyPasskeyAuthentication(result.credential.responseJson, operation.environment.authBaseUrl)
                    .onSuccess { response ->
                        acceptSession(operation, response.user, response.session.token)
                    }
                    .onFailure { error ->
                        complete(operation) { _authState.value = AuthState.Error(error.message ?: "Passkey sign in failed") }
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
        val environment = appSettings.apiEnvironment.value

        // Get registration options from server
        val options = authService.getPasskeyRegisterOptions(currentState.token, environment.authBaseUrl)
            .getOrElse { return CredentialResult.Error(it.message ?: "Failed to get passkey options") }

        val optionsJson = kotlinx.serialization.json.Json.encodeToString(
            com.qcksys.ao3tracker.data.model.PasskeyRegisterOptions.serializer(),
            options
        )

        return when (val result = helper.createPasskey(optionsJson)) {
            is CredentialResult.Passkey -> {
                if (environment != appSettings.apiEnvironment.value || !isCurrentToken(currentState.token)) {
                    return CredentialResult.Error("Account or API environment changed")
                }
                // Verify registration with server
                authService.verifyPasskeyRegistration(
                    currentState.token,
                    result.credential.responseJson,
                    baseUrl = environment.authBaseUrl
                ).onFailure {
                    return CredentialResult.Error(it.message ?: "Failed to verify passkey")
                }
                result
            }
            else -> result
        }
    }

    suspend fun importGuestData(expectedOwner: String): com.qcksys.ao3tracker.data.database.GuestImportResult {
        val session = _authState.value as? AuthState.Authenticated
            ?: error("Sign in to import guest data")
        check(currentOwner() == expectedOwner) { "Account changed" }
        val generation = accountData.generation
        return accountData.importGuest(expectedOwner) {
            accountData.generation == generation && isCurrentSession(session.token, expectedOwner)
        }
    }

    fun hasCredentialSupport(): Boolean = credentialHelper?.isSupported() == true

    suspend fun signOut() {
        val currentState = _authState.value
        val operation = beginOperation()
        complete(operation) { clearSession() }
        if (currentState is AuthState.Authenticated)
            authService.signOut(currentState.token, operation.environment.authBaseUrl)
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
    override suspend fun invalidateSession() {
        val operation = beginOperation(loading = false)
        complete(operation) { clearSession() }
    }

    private suspend fun clearSession() {
        tokenStorage.clearToken()
        _authState.value = AuthState.Idle
        accountData.activate(AccountDataStore.GUEST)
        isInitialized = false // Allow re-initialization on next attempt
    }

    private fun accountOwner(userId: String): String =
        AccountDataStore.owner(appSettings.apiEnvironment.value.name, userId)

    override fun currentOwner(): String? {
        val state = _authState.value as? AuthState.Authenticated ?: return null
        return state.user?.let { accountOwner(it.id) }
    }

    private fun isCurrentToken(token: String): Boolean =
        (_authState.value as? AuthState.Authenticated)?.token == token

    override fun isCurrentSession(token: String, owner: String): Boolean =
        isCurrentToken(token) && currentOwner() == owner && accountData.active.value?.owner == owner

    override suspend fun prepareSession(): Boolean {
        val state = _authState.value as? AuthState.Authenticated ?: return false
        return state.user != null || validateSession()
    }
}
