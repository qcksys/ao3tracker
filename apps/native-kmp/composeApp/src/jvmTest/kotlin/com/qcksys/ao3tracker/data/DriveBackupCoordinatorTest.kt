package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.backup.DriveAccess
import com.qcksys.ao3tracker.data.backup.DriveBackupCoordinator
import com.qcksys.ao3tracker.data.backup.DriveBackupFile
import com.qcksys.ao3tracker.data.backup.DriveBackupLocation
import com.qcksys.ao3tracker.data.backup.DriveBackupState
import com.qcksys.ao3tracker.data.backup.DriveFiles
import com.qcksys.ao3tracker.data.backup.DriveSignInCancelledException
import com.qcksys.ao3tracker.data.backup.DriveUnauthorizedException
import com.qcksys.ao3tracker.data.backup.GoogleDriveAuthorizer
import com.qcksys.ao3tracker.data.backup.decodeLibraryExport
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.WorkEntity
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.settings.AppSettings
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull

class DriveBackupCoordinatorTest {
    @Test
    fun `signing in uploads the library and later changes wait for the delay or a flush`() = fixture { f ->
        f.addWork(1)
        f.coordinator.signIn(DriveBackupLocation.MY_DRIVE)

        val first = f.drive.awaitUpload()
        val state = f.awaitState { it.account != null && it.deviceId != null }
        assertEquals(EMAIL, state.account)
        assertEquals("AO3 Tracker backup - Test Phone - Guest.json", first.file.name)
        assertEquals(state.deviceId, first.file.deviceId)
        assertEquals(AccountDataStore.GUEST, first.file.library)
        assertEquals(listOf(1L), decodeLibraryExport(first.content).works.map { it.id })

        f.addWork(2)
        assertNull(withTimeoutOrNull(300.milliseconds) { f.drive.uploads.receive() }, "Uploads wait for the backup delay")
        val second = f.drive.awaitUpload { f.coordinator.flush() }
        assertEquals(first.file.id, second.file.id, "The device's backup is updated in place")
        assertEquals(setOf(1L, 2L), decodeLibraryExport(second.content).works.map { it.id }.toSet())
        assertNotNull(f.awaitState { it.lastBackupAt != null }.lastBackupAt)
    }

    @Test
    fun `each library keeps its own backup file`() = fixture { f ->
        f.addWork(1)
        f.coordinator.signIn(DriveBackupLocation.MY_DRIVE)
        val guest = f.drive.awaitUpload()

        f.accounts.activate(ACCOUNT)
        f.addWork(2)
        val account = f.drive.awaitUpload { f.coordinator.flush() }

        assertTrue(guest.file.id != account.file.id)
        assertEquals(ACCOUNT, account.file.library)
        assertEquals("AO3 Tracker backup - Test Phone - Account.json", account.file.name)
        assertEquals(listOf(1L), decodeLibraryExport(f.drive.content(guest.file.id)).works.map { it.id })
        assertEquals(listOf(2L), decodeLibraryExport(f.drive.content(account.file.id)).works.map { it.id })
    }

    @Test
    fun `automatic backups skip an empty library but backing up now uploads it`() = fixture { f ->
        f.coordinator.signIn(DriveBackupLocation.MY_DRIVE)

        f.awaitState { it.message?.contains("empty") == true }
        assertTrue(f.drive.stored.isEmpty())

        f.coordinator.backupNow()
        assertEquals(emptyList(), decodeLibraryExport(f.drive.awaitUpload().content).works)
    }

    @Test
    fun `a silent sign-in request pauses automatic backups until the user backs up now`() = fixture { f ->
        f.addWork(1)
        f.coordinator.signIn(DriveBackupLocation.MY_DRIVE)
        f.drive.awaitUpload()

        f.authorizer.silent = DriveAccess.SignInRequired
        f.addWork(2)
        while (!f.coordinator.state.value.signInRequired) {
            f.coordinator.flush()
            delay(20)
        }
        val requests = f.authorizer.requests.size
        f.addWork(3)
        repeat(5) {
            f.coordinator.flush()
            delay(20)
        }
        assertEquals(requests, f.authorizer.requests.size, "Paused backups do not keep asking Google for a token")

        f.coordinator.backupNow()
        assertEquals(3, decodeLibraryExport(f.drive.awaitUpload().content).works.size)
        f.awaitState { !it.signInRequired }
    }

    @Test
    fun `a rejected token is cleared and the request retried with a new one`() = fixture { f ->
        f.addWork(1)
        f.coordinator.signIn(DriveBackupLocation.MY_DRIVE)
        f.drive.awaitUpload()

        f.drive.rejected += "token-1"
        f.coordinator.backupNow()

        f.drive.awaitUpload()
        assertEquals(listOf("token-1"), f.authorizer.cleared)
    }

    @Test
    fun `signing out revokes access and stops backups`() = fixture { f ->
        f.addWork(1)
        f.coordinator.signIn(DriveBackupLocation.MY_DRIVE)
        f.drive.awaitUpload()

        f.coordinator.signOut()

        assertEquals(listOf(EMAIL), f.authorizer.revoked)
        f.awaitState { it.account == null }
        f.addWork(2)
        f.coordinator.flush()
        assertNull(withTimeoutOrNull(300.milliseconds) { f.drive.uploads.receive() })
    }

    @Test
    fun `moving backups needs consent for the new location`() = fixture { f ->
        f.addWork(1)
        f.coordinator.signIn(DriveBackupLocation.MY_DRIVE)
        f.drive.awaitUpload()

        f.authorizer.interactive = DriveAccess.Cancelled
        assertFailsWith<DriveSignInCancelledException> { f.coordinator.setLocation(DriveBackupLocation.APP_DATA) }
        assertEquals(DriveBackupLocation.MY_DRIVE, f.coordinator.state.value.location)

        f.authorizer.interactive = DriveAccess.Granted("token-1")
        f.coordinator.setLocation(DriveBackupLocation.APP_DATA)

        assertTrue(Triple(DriveBackupLocation.APP_DATA, EMAIL, true) in f.authorizer.requests)
        assertEquals(DriveBackupLocation.APP_DATA, f.drive.awaitUpload().location)
    }

    @Test
    fun `sign-in finishes after the screen that started it goes away`() = fixture { f ->
        f.addWork(1)
        val consent = CompletableDeferred<Unit>()
        f.authorizer.interactiveGate = consent
        val screen = CoroutineScope(Dispatchers.Default)
        val request = screen.launch { f.coordinator.signIn(DriveBackupLocation.MY_DRIVE) }
        f.awaitState { it.busy }

        request.cancelAndJoin()
        consent.complete(Unit)

        f.drive.awaitUpload()
        assertEquals(EMAIL, f.awaitState { it.account != null }.account)
    }

    @Test
    fun `restoring lists backups and decodes the chosen file`() = fixture { f ->
        f.addWork(1)
        f.coordinator.signIn(DriveBackupLocation.MY_DRIVE)
        f.drive.awaitUpload()

        val backup = f.coordinator.listBackups().single()
        assertEquals(listOf(1L), f.coordinator.download(backup).works.map { it.id })
    }

    private class Upload(val location: DriveBackupLocation, val file: DriveBackupFile, val content: String)

    private class FakeAuthorizer : GoogleDriveAuthorizer {
        override val deviceName = "Test Phone"
        @Volatile var silent: DriveAccess = DriveAccess.Granted("token-1")
        @Volatile var interactive: DriveAccess = DriveAccess.Granted("token-1")

        /** Holds interactive requests open, like Google's consent screen waiting for the user. */
        @Volatile var interactiveGate: CompletableDeferred<Unit>? = null
        val requests = CopyOnWriteArrayList<Triple<DriveBackupLocation, String?, Boolean>>()
        val cleared = CopyOnWriteArrayList<String>()
        val revoked = CopyOnWriteArrayList<String>()

        override suspend fun authorize(location: DriveBackupLocation, account: String?, interactive: Boolean): DriveAccess {
            requests += Triple(location, account, interactive)
            if (interactive) interactiveGate?.await()
            val access = if (interactive) this.interactive else silent
            return if (access is DriveAccess.Granted && access.token in cleared) DriveAccess.Granted("token-2") else access
        }

        override suspend fun clearToken(token: String) {
            cleared += token
        }

        override suspend fun revoke(account: String) {
            revoked += account
        }
    }

    private class FakeDrive : DriveFiles {
        val stored = CopyOnWriteArrayList<Upload>()
        val rejected = CopyOnWriteArrayList<String>()
        val uploads = Channel<Upload>(Channel.UNLIMITED)

        fun content(id: String) = stored.last { it.file.id == id }.content

        /** Waits for the next upload, calling [trigger] (such as a flush) until one arrives. */
        suspend fun awaitUpload(trigger: () -> Unit = {}): Upload = withTimeout(10_000) {
            var upload = uploads.tryReceive().getOrNull()
            while (upload == null) {
                trigger()
                delay(20)
                upload = uploads.tryReceive().getOrNull()
            }
            upload
        }

        private fun check(token: String) {
            if (token in rejected) throw DriveUnauthorizedException()
        }

        override suspend fun accountEmail(token: String) = EMAIL.also { check(token) }

        override suspend fun list(token: String, location: DriveBackupLocation): List<DriveBackupFile> {
            check(token)
            return stored.filter { it.location == location }.map { it.file }.distinctBy { it.id }.reversed()
        }

        override suspend fun upload(
            token: String,
            location: DriveBackupLocation,
            existing: DriveBackupFile?,
            name: String,
            properties: Map<String, String>,
            content: String
        ): DriveBackupFile {
            check(token)
            val file = DriveBackupFile(
                id = existing?.id ?: "file-${stored.size + 1}",
                name = name,
                appProperties = properties + (DriveBackupFile.PROPERTY_BACKUP to "1")
            )
            stored.removeAll { it.file.id == file.id }
            val upload = Upload(location, file, content)
            stored += upload
            uploads.send(upload)
            return file
        }

        override suspend fun download(token: String, fileId: String): String {
            check(token)
            return content(fileId)
        }
    }

    private class Fixture(
        val accounts: AccountDataStore,
        val authorizer: FakeAuthorizer,
        val drive: FakeDrive,
        val coordinator: DriveBackupCoordinator
    ) {
        suspend fun addWork(id: Long) {
            val now = System.currentTimeMillis() + id
            accounts.edit { accounts.database.workDao().upsertWork(WorkEntity(id, lastRead = now, rowCreatedAt = now, rowUpdatedAt = now)) }
        }

        /** The public state is derived asynchronously from settings and status. */
        suspend fun awaitState(predicate: (DriveBackupState) -> Boolean): DriveBackupState =
            withTimeout(10_000) { coordinator.state.first(predicate) }
    }

    private fun fixture(block: suspend (Fixture) -> Unit) = runBlocking {
        val directory = Files.createTempDirectory("ao3tracker-drive-")
        val accounts = createTestAccounts(directory)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            accounts.initialize()
            val authorizer = FakeAuthorizer()
            val drive = FakeDrive()
            val coordinator = DriveBackupCoordinator(
                authorizer, drive, accounts, Ao3Repository(accounts), AppSettings(null),
                libraryLabel = { if (it == AccountDataStore.GUEST) "Guest" else "Account" },
                scope = scope,
                backupDelay = 1.hours
            )
            block(Fixture(accounts, authorizer, drive, coordinator))
        } finally {
            scope.cancel()
            accounts.close()
            Files.walk(directory).use { files -> files.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }

    private companion object {
        const val EMAIL = "reader@example.com"
        const val ACCOUNT = "PRODUCTION:user"
    }
}
