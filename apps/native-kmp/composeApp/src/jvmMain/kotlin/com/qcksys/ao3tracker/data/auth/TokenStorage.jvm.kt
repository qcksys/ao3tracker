package com.qcksys.ao3tracker.data.auth

import java.util.prefs.Preferences

actual fun getTokenStorage(): TokenStorage = TokenStorage()

actual class TokenStorage {
    private val prefs: Preferences = Preferences.userNodeForPackage(TokenStorage::class.java)

    actual fun getToken(): String? {
        return prefs.get(TOKEN_KEY, null)
    }

    actual fun saveToken(token: String) {
        prefs.put(TOKEN_KEY, token)
    }

    actual fun clearToken() {
        prefs.remove(TOKEN_KEY)
    }

    companion object {
        private const val TOKEN_KEY = "auth_token"
    }
}
