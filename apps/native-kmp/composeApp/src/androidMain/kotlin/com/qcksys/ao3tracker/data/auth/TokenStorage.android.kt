package com.qcksys.ao3tracker.data.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.github.aakira.napier.Napier
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException

private lateinit var appContext: Context

fun initializeTokenStorage(context: Context) {
    appContext = context.applicationContext
}

actual fun getTokenStorage(): TokenStorage = TokenStorage()

actual class TokenStorage {
    private var usingFallback = false

    private val prefs: SharedPreferences by lazy {
        try {
            val encryptedPrefs = createEncryptedPrefs()

            // Check if encrypted storage actually has the token
            val encryptedToken = encryptedPrefs.getString(TOKEN_KEY, null)

            if (encryptedToken == null) {
                // No token in encrypted - check fallback for migration (one-time)
                val fallbackPrefs = getFallbackPrefs()
                val fallbackToken = fallbackPrefs.getString(TOKEN_KEY, null)

                if (fallbackToken != null) {
                    Napier.d("Migrating token from fallback to encrypted storage")
                    // Use commit() for synchronous write to ensure it completes
                    val saved = encryptedPrefs.edit().putString(TOKEN_KEY, fallbackToken).commit()
                    if (saved) {
                        fallbackPrefs.edit().remove(TOKEN_KEY).commit()
                        Napier.d("Migration successful")
                    } else {
                        Napier.w("Failed to save to encrypted storage during migration")
                    }
                }
            } else {
                Napier.d("Token found in encrypted storage")
            }

            encryptedPrefs
        } catch (e: Exception) {
            Napier.e("Failed to create encrypted preferences: ${e.message}", e)

            // Try to recover by clearing corrupted encrypted prefs
            if (tryRecoverEncryptedPrefs()) {
                try {
                    val recoveredPrefs = createEncryptedPrefs()
                    // Check fallback for token to restore
                    val fallbackPrefs = getFallbackPrefs()
                    val fallbackToken = fallbackPrefs.getString(TOKEN_KEY, null)
                    if (fallbackToken != null) {
                        recoveredPrefs.edit().putString(TOKEN_KEY, fallbackToken).commit()
                    }
                    return@lazy recoveredPrefs
                } catch (e2: Exception) {
                    Napier.e("Recovery failed, using fallback storage", e2)
                }
            }

            usingFallback = true
            Napier.w("Using fallback (unencrypted) token storage")
            getFallbackPrefs()
        }
    }

    private fun createEncryptedPrefs(): SharedPreferences {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            appContext,
            ENCRYPTED_PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun getFallbackPrefs(): SharedPreferences {
        return appContext.getSharedPreferences(FALLBACK_PREFS_FILE_NAME, Context.MODE_PRIVATE)
    }

    private fun tryRecoverEncryptedPrefs(): Boolean {
        return try {
            // Delete the corrupted encrypted prefs file
            val prefsFile = File(appContext.filesDir.parent, "shared_prefs/$ENCRYPTED_PREFS_FILE_NAME.xml")
            if (prefsFile.exists()) {
                prefsFile.delete()
                Napier.d("Deleted corrupted encrypted prefs file")
            }
            true
        } catch (e: Exception) {
            Napier.e("Failed to delete corrupted prefs file", e)
            false
        }
    }

    actual fun getToken(): String? {
        val token = try {
            prefs.getString(TOKEN_KEY, null)
        } catch (e: Exception) {
            Napier.e("Error reading token from encrypted, trying fallback", e)
            getFallbackPrefs().getString(TOKEN_KEY, null)
        }
        Napier.d("getToken: ${if (token != null) "found (${token.take(8)}...)" else "null"}")
        return token
    }

    actual fun saveToken(token: String) {
        Napier.d("saveToken: saving token (${token.take(8)}...)")
        // Use commit() for synchronous write
        val saved = try {
            prefs.edit().putString(TOKEN_KEY, token).commit()
        } catch (e: Exception) {
            Napier.e("Error saving token to encrypted storage", e)
            false
        }

        if (!saved || usingFallback) {
            Napier.d("Saving to fallback storage")
            getFallbackPrefs().edit().putString(TOKEN_KEY, token).commit()
        }
    }

    actual fun clearToken() {
        Napier.d("clearToken: clearing token")
        try {
            prefs.edit().remove(TOKEN_KEY).commit()
        } catch (e: Exception) {
            Napier.e("Error clearing token from encrypted storage", e)
        }
        // Always clear from fallback too
        getFallbackPrefs().edit().remove(TOKEN_KEY).commit()
    }

    companion object {
        private const val ENCRYPTED_PREFS_FILE_NAME = "ao3_auth_prefs_encrypted"
        private const val FALLBACK_PREFS_FILE_NAME = "ao3_auth_prefs_fallback"
        private const val TOKEN_KEY = "auth_token"
    }
}
