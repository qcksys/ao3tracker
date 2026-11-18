package com.qcksys.ao3tracker.data.backup

import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.model.ExportData
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.DriveBackupPreferences
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.uuid.Uuid

data class DriveBackupState(
    /** False where the platform has no Google Drive support. */
    val available: Boolean,
    val account: String? = null,
    val location: DriveBackupLocation = DriveBackupLocation.MY_DRIVE,
    val deviceId: String? = null,
    val lastBackupAt: Long? = null,
    val busy: Boolean = false,
    /** Automatic backups are paused until the user signs in with Google again. */
    val signInRequired: Boolean = false,
    val message: String? = null
)

/** The user closed Google's sign-in or consent screen. */
class DriveSignInCancelledException : Exception()

class DriveSignInRequiredException : Exception("Sign in with Google again to continue backing up")

/**
 * One-way backup of the active library to the user's Google Drive, in the Export Data JSON format.
 *
 * After a library change, a backup uploads [backupDelay] later (or when the app stops), so frequent
 * reading progress produces at most one upload per delay. Each device and library keeps its own
 * file, so two devices or libraries never overwrite each other's backups. Restoring is manual.
 */
class DriveBackupCoordinator(
    private val authorizer: GoogleDriveAuthorizer?,
    private val files: DriveFiles,
    private val accounts: AccountDataStore,
    private val repository: Ao3Repository,
    private val settings: AppSettings,
    private val libraryLabel: (owner: String) -> String,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val backupDelay: Duration = 1.minutes
) {
    private data class Status(val busy: Boolean = false, val signInRequired: Boolean = false, val message: String? = null)

    private val mutex = Mutex()
    private val status = MutableStateFlow(Status())
    private val pending = MutableStateFlow(false)
    private val flushes = Channel<Unit>(Channel.CONFLATED)

    val state: StateFlow<DriveBackupState> = combine(settings.driveBackupPreferences, status, ::toState)
        .stateIn(scope, SharingStarted.Eagerly, toState(settings.driveBackupPreferences.value, status.value))

    init {
        if (authorizer != null) {
            scope.launch {
                accounts.observe { it.workDao().observeLibraryRevision() }.distinctUntilChanged().collect {
                    if (settings.driveBackupPreferences.value.account != null) pending.value = true
                }
            }
            scope.launch {
                while (true) {
                    pending.first { it }
                    withTimeoutOrNull(backupDelay) { flushes.receive() }
                    pending.value = false
                    try {
                        backup(interactive = false)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (_: Exception) {
                        // The status message reports the failure; the next library change retries.
                    }
                }
            }
        }
    }

    private fun toState(preferences: DriveBackupPreferences, status: Status) = DriveBackupState(
        available = authorizer != null,
        account = preferences.account,
        location = preferences.location,
        deviceId = preferences.deviceId,
        lastBackupAt = preferences.lastBackupAt,
        busy = status.busy,
        signInRequired = status.signInRequired,
        message = status.message
    )

    /** Uploads a pending backup now, for example when the app moves to the background. */
    fun flush() {
        if (pending.value) flushes.trySend(Unit)
    }

    private fun requestBackup() {
        pending.value = true
        flushes.trySend(Unit)
    }

    suspend fun signIn(location: DriveBackupLocation) {
        operation {
            val token = when (val access = requireAuthorizer().authorize(location, account = null, interactive = true)) {
                is DriveAccess.Granted -> access.token
                else -> throw DriveSignInCancelledException()
            }
            val email = files.accountEmail(token)
            val previous = settings.driveBackupPreferences.value
            settings.setDriveBackupPreferences(previous.copy(
                account = email,
                location = location,
                deviceId = previous.deviceId ?: Uuid.random().toString(),
                lastBackupAt = previous.lastBackupAt.takeIf { previous.account == email }
            ))
            status.update { it.copy(signInRequired = false) }
            requestBackup()
        }
    }

    suspend fun signOut() = mutex.withLock {
        val preferences = settings.driveBackupPreferences.value
        val account = preferences.account ?: return@withLock
        settings.setDriveBackupPreferences(preferences.copy(account = null, lastBackupAt = null))
        pending.value = false
        status.value = Status()
        try {
            requireAuthorizer().revoke(account)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            status.value = Status(message = "Signed out on this device. If AO3 Tracker still has access, remove it in your Google Account settings.")
        }
    }

    /** Moves future backups to [location]; a connected account must first grant that location's scope. */
    suspend fun setLocation(location: DriveBackupLocation) = operation {
        val preferences = settings.driveBackupPreferences.value
        if (preferences.location == location) return@operation
        val account = preferences.account
        if (account != null) {
            val access = requireAuthorizer().authorize(location, account, interactive = true)
            if (access !is DriveAccess.Granted) throw DriveSignInCancelledException()
            status.update { it.copy(signInRequired = false) }
        }
        settings.setDriveBackupPreferences(settings.driveBackupPreferences.value.copy(location = location))
        if (account != null) requestBackup()
    }

    suspend fun backupNow() = backup(interactive = true)

    suspend fun listBackups(): List<DriveBackupFile> = operation {
        val preferences = connectedPreferences()
        withToken(preferences, interactive = true) { files.list(it, preferences.location) }
    }

    suspend fun download(file: DriveBackupFile): ExportData = operation {
        val preferences = connectedPreferences()
        decodeLibraryExport(withToken(preferences, interactive = true) { files.download(it, file.id) })
    }

    private suspend fun backup(interactive: Boolean) = operation {
        val preferences = settings.driveBackupPreferences.value
        if (preferences.account == null) return@operation
        if (!interactive && status.value.signInRequired) return@operation
        val generation = accounts.generation
        val owner = accounts.initialize().owner
        val data = repository.getExportData()
        // A switched library schedules its own backup through the revision flow.
        if (accounts.generation != generation || accounts.active.value?.owner != owner) return@operation
        if (!interactive && data.works.isEmpty()) {
            // Protects the last backup from a deleted or signed-out library; Back up now still uploads.
            status.update { it.copy(message = "Automatic backup skipped because this library is empty") }
            return@operation
        }
        val deviceId = preferences.deviceId ?: Uuid.random().toString()
        withToken(preferences, interactive) { token ->
            val existing = files.list(token, preferences.location)
                .firstOrNull { it.deviceId == deviceId && it.library == owner }
            files.upload(
                token = token,
                location = preferences.location,
                existing = existing,
                name = "AO3 Tracker backup - ${requireAuthorizer().deviceName} - ${libraryLabel(owner)}.json",
                properties = mapOf(DriveBackupFile.PROPERTY_DEVICE to deviceId, DriveBackupFile.PROPERTY_LIBRARY to owner),
                content = encodeLibraryExport(data)
            )
        }
        val current = settings.driveBackupPreferences.value
        if (current.account == preferences.account && current.location == preferences.location) {
            settings.setDriveBackupPreferences(current.copy(
                deviceId = deviceId,
                lastBackupAt = Clock.System.now().toEpochMilliseconds()
            ))
        }
    }

    private fun connectedPreferences(): DriveBackupPreferences =
        settings.driveBackupPreferences.value.takeIf { it.account != null }
            ?: throw IllegalStateException("Sign in with Google first")

    private fun requireAuthorizer(): GoogleDriveAuthorizer =
        authorizer ?: throw UnsupportedOperationException("Google Drive backup is not available on this device")

    private suspend fun <T> withToken(
        preferences: DriveBackupPreferences,
        interactive: Boolean,
        block: suspend (token: String) -> T
    ): T {
        val token = token(preferences, interactive)
        return try {
            block(token)
        } catch (_: DriveUnauthorizedException) {
            requireAuthorizer().clearToken(token)
            block(token(preferences, interactive))
        }
    }

    private suspend fun token(preferences: DriveBackupPreferences, interactive: Boolean): String =
        when (val access = requireAuthorizer().authorize(preferences.location, preferences.account, interactive)) {
            is DriveAccess.Granted -> {
                status.update { it.copy(signInRequired = false) }
                access.token
            }
            DriveAccess.SignInRequired -> {
                status.update { it.copy(signInRequired = true) }
                throw DriveSignInRequiredException()
            }
            DriveAccess.Cancelled -> throw DriveSignInCancelledException()
        }

    /**
     * Runs in the coordinator's scope, off the main thread. Google's consent screen can outlive the
     * Settings screen that opened it (activity recreation), and its result must still finish the work.
     */
    private suspend fun <T> operation(block: suspend () -> T): T =
        scope.async { mutex.withLock { runOperation(block) } }.await()

    private suspend fun <T> runOperation(block: suspend () -> T): T {
        status.update { it.copy(busy = true, message = null) }
        try {
            return block()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            status.update { it.copy(message = error.message) }
            throw error
        } finally {
            status.update { it.copy(busy = false) }
        }
    }
}
