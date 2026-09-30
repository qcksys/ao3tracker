package com.qcksys.ao3tracker.data.auth

import platform.Foundation.NSUserDefaults

actual fun getTokenStorage(): TokenStorage = TokenStorage()

/**
 * iOS Token Storage using NSUserDefaults.
 *
 * Note: For production apps with sensitive tokens, consider migrating to iOS Keychain
 * using Security framework (SecItemAdd, SecItemCopyMatching, etc.). NSUserDefaults is
 * encrypted at rest on iOS when device has a passcode, but Keychain provides additional
 * security features like access control and data protection classes.
 */
actual class TokenStorage : SessionTokenStorage {
    private val userDefaults = NSUserDefaults.standardUserDefaults

    actual override fun getToken(): String? {
        return userDefaults.stringForKey(TOKEN_KEY)
    }

    actual override fun saveToken(token: String) {
        userDefaults.setObject(token, TOKEN_KEY)
        userDefaults.synchronize()
    }

    actual override fun clearToken() {
        userDefaults.removeObjectForKey(TOKEN_KEY)
        userDefaults.synchronize()
    }

    companion object {
        private const val TOKEN_KEY = "auth_token"
    }
}
