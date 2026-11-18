package com.qcksys.ao3tracker.data.backup

sealed interface DriveAccess {
    data class Granted(val token: String) : DriveAccess

    /** Google needs the user to choose an account or consent, which only an interactive request can show. */
    data object SignInRequired : DriveAccess

    data object Cancelled : DriveAccess
}

/** Obtains Google OAuth access tokens for Drive. Tokens are cached by the platform, never by the app. */
interface GoogleDriveAuthorizer {
    /** Shown in backup file names so each device keeps its own backup. */
    val deviceName: String

    /**
     * Requests the scope for [location]. [account] selects a previously connected Google account;
     * null lets the user choose. Only [interactive] requests may show Google's sign-in screens.
     */
    suspend fun authorize(location: DriveBackupLocation, account: String?, interactive: Boolean): DriveAccess

    /** Removes a rejected token from the platform cache so the next request fetches a new one. */
    suspend fun clearToken(token: String)

    /** Disconnects [account] from the app, revoking every Drive scope it granted. */
    suspend fun revoke(account: String)
}

/** Null where Google Drive backup is unavailable (iOS and desktop). */
expect fun googleDriveAuthorizer(): GoogleDriveAuthorizer?
