package com.qcksys.ao3tracker.data.backup

import android.accounts.Account
import android.app.Activity
import android.content.Context
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.identity.RevokeAccessRequest
import com.google.android.gms.common.api.Scope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

private const val GOOGLE_ACCOUNT_TYPE = "com.google"

private var instance: AndroidGoogleDriveAuthorizer? = null

fun initializeGoogleDrive(context: Context) {
    if (instance == null) instance = AndroidGoogleDriveAuthorizer(context.applicationContext)
}

fun androidGoogleDriveAuthorizer(): AndroidGoogleDriveAuthorizer? = instance

actual fun googleDriveAuthorizer(): GoogleDriveAuthorizer? = instance

/**
 * Uses Google Identity Services' AuthorizationClient, which shows the account picker and consent
 * screen together and caches tokens in Google Play services. The activity owns the result launcher
 * because only an activity can show Google's screens.
 */
class AndroidGoogleDriveAuthorizer(context: Context) : GoogleDriveAuthorizer {
    private val client = Identity.getAuthorizationClient(context)
    private val interactive = Mutex()
    private var launcher: ActivityResultLauncher<IntentSenderRequest>? = null
    private var pendingResult: CompletableDeferred<ActivityResult>? = null

    override val deviceName: String = if (Build.MODEL.startsWith(Build.MANUFACTURER, ignoreCase = true)) {
        Build.MODEL
    } else {
        "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
    }

    fun attach(launcher: ActivityResultLauncher<IntentSenderRequest>) {
        this.launcher = launcher
    }

    fun detach(launcher: ActivityResultLauncher<IntentSenderRequest>) {
        if (this.launcher === launcher) this.launcher = null
    }

    /** Receives the result in whichever activity instance is current, including after recreation. */
    fun onResult(result: ActivityResult) {
        pendingResult?.complete(result)
    }

    override suspend fun authorize(location: DriveBackupLocation, account: String?, interactive: Boolean): DriveAccess {
        val request = AuthorizationRequest.builder()
            .setRequestedScopes(listOf(Scope(location.scope)))
            .apply { if (account != null) setAccount(Account(account, GOOGLE_ACCOUNT_TYPE)) }
            .build()
        val result = client.authorize(request).await()
        if (!result.hasResolution()) {
            return result.accessToken?.let { DriveAccess.Granted(it) } ?: DriveAccess.SignInRequired
        }
        if (!interactive) return DriveAccess.SignInRequired
        val intent = requireNotNull(result.pendingIntent) { "Google did not provide a sign-in screen" }
        return this.interactive.withLock {
            val launcher = launcher ?: error("Open AO3 Tracker to sign in with Google")
            val deferred = CompletableDeferred<ActivityResult>()
            pendingResult = deferred
            val activityResult = try {
                withContext(Dispatchers.Main) { launcher.launch(IntentSenderRequest.Builder(intent).build()) }
                deferred.await()
            } finally {
                pendingResult = null
            }
            if (activityResult.resultCode != Activity.RESULT_OK) return@withLock DriveAccess.Cancelled
            client.getAuthorizationResultFromIntent(activityResult.data).accessToken
                ?.let { DriveAccess.Granted(it) }
                ?: DriveAccess.Cancelled
        }
    }

    override suspend fun clearToken(token: String) {
        client.clearToken(ClearTokenRequest.builder().setToken(token).build()).await()
    }

    override suspend fun revoke(account: String) {
        val request = RevokeAccessRequest.builder()
            .setAccount(Account(account, GOOGLE_ACCOUNT_TYPE))
            .setScopes(DriveBackupLocation.entries.map { Scope(it.scope) })
            .build()
        client.revokeAccess(request).await()
    }
}
