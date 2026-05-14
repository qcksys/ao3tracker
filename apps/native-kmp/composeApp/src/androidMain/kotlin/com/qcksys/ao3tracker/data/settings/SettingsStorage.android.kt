package com.qcksys.ao3tracker.data.settings

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.github.aakira.napier.Napier
import java.io.IOException
import java.security.GeneralSecurityException

private lateinit var appContext: Context

fun initializeSettingsStorage(context: Context) {
    appContext = context.applicationContext
}

actual fun getSettingsStorage(): SettingsStorage = SettingsStorage()

actual class SettingsStorage {
    private val prefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(appContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                appContext,
                PREFS_FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: GeneralSecurityException) {
            Napier.e("Failed to create encrypted preferences, falling back to standard", e)
            fallbackToStandardPrefs()
        } catch (e: IOException) {
            Napier.e("Failed to create encrypted preferences, falling back to standard", e)
            fallbackToStandardPrefs()
        }
    }

    private fun fallbackToStandardPrefs(): SharedPreferences {
        return appContext.getSharedPreferences(PREFS_FILE_NAME, Context.MODE_PRIVATE)
    }

    actual fun getApiEnvironment(): String? {
        return prefs.getString(KEY_API_ENVIRONMENT, null)
    }

    actual fun setApiEnvironment(environment: String) {
        prefs.edit().putString(KEY_API_ENVIRONMENT, environment).apply()
    }

    actual fun isDevModeEnabled(): Boolean {
        return prefs.getBoolean(KEY_DEV_MODE, false)
    }

    actual fun setDevModeEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_DEV_MODE, enabled).apply()
    }

    actual fun getLastSyncTimestamp(): String? {
        return prefs.getString(KEY_LAST_SYNC_TIMESTAMP, null)
    }

    actual fun setLastSyncTimestamp(timestamp: String?) {
        if (timestamp != null) {
            prefs.edit().putString(KEY_LAST_SYNC_TIMESTAMP, timestamp).apply()
        } else {
            prefs.edit().remove(KEY_LAST_SYNC_TIMESTAMP).apply()
        }
    }

    actual fun isAutoSyncOnOpenEnabled(): Boolean {
        return prefs.getBoolean(KEY_AUTO_SYNC_ON_OPEN, true)
    }

    actual fun setAutoSyncOnOpenEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AUTO_SYNC_ON_OPEN, enabled).apply()
    }

    actual fun getFavouriteTagFilters(): Set<String> {
        // Newline-delimited; tag values from AO3 never contain newlines.
        val raw = prefs.getString(KEY_FAVOURITE_TAG_FILTERS, null) ?: return emptySet()
        return if (raw.isEmpty()) emptySet() else raw.split('\n').toSet()
    }

    actual fun setFavouriteTagFilters(filters: Set<String>) {
        prefs.edit().putString(KEY_FAVOURITE_TAG_FILTERS, filters.joinToString("\n")).apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "ao3_app_settings_encrypted"
        private const val KEY_API_ENVIRONMENT = "api_environment"
        private const val KEY_DEV_MODE = "dev_mode_enabled"
        private const val KEY_LAST_SYNC_TIMESTAMP = "last_sync_timestamp"
        private const val KEY_AUTO_SYNC_ON_OPEN = "auto_sync_on_open"
        private const val KEY_FAVOURITE_TAG_FILTERS = "favourite_tag_filters"
    }
}
