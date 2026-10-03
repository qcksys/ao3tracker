package com.qcksys.ao3tracker.ui.components

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import androidx.activity.compose.setContent
import androidx.lifecycle.Lifecycle
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.qcksys.ao3tracker.OfflineReaderTestActivity
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.Ao3Database
import com.qcksys.ao3tracker.data.offline.*
import com.qcksys.ao3tracker.data.settings.AppSettings
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import org.junit.Test
import org.junit.runner.RunWith
import org.koin.compose.KoinIsolatedContext
import org.koin.dsl.koinApplication
import org.koin.dsl.module
import kotlin.test.*

@RunWith(AndroidJUnit4::class)
class OfflineDownloadServiceTest {
    @Suppress("DEPRECATION")
    @Test
    fun queuedDownloadsKeepAForegroundServiceInBackgroundAndScreenLockAndReleaseItWhenRemoved() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val power = context.getSystemService(PowerManager::class.java)
        fun shell(command: String) = instrumentation.uiAutomation.executeShellCommand(command).use {
            android.os.ParcelFileDescriptor.AutoCloseInputStream(it).use { output -> output.readBytes() }
        }
        val directory = File(context.noBackupFilesDir, "offline-service-test-${UUID.randomUUID()}").apply { mkdirs() }
        val open = { name: String -> Room.databaseBuilder<Ao3Database>(context, File(directory, name).absolutePath)
            .setDriver(BundledSQLiteDriver()).setQueryCoroutineContext(Dispatchers.IO).build() }
        val accounts = AccountDataStore(open("test.db"), open)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val store = OfflineContentStore(accounts, DiskOfflineFiles(File(directory, "files")))
        val gate = Ao3RequestGate().apply { pause("60") }
        val coordinator = OfflineCoordinator(store, accounts, AppSettings(null), gate, MutableStateFlow(OfflineNetwork(true, true)), true, scope)
        val testKoin = koinApplication { modules(module { single { coordinator } }) }
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        fun service() = manager.getRunningServices(Int.MAX_VALUE).firstOrNull { it.service.className == OfflineDownloadService::class.java.name }
        try {
            accounts.initialize()
            store.observeIdentity("guest")
            ActivityScenario.launch(OfflineReaderTestActivity::class.java).use { scenario ->
                scenario.onActivity { activity -> activity.setContent {
                    KoinIsolatedContext(context = testKoin) { OfflineDownloadHost() }
                } }
                withTimeout(10_000) { coordinator.isForeground.first { it } }
                withContext(Dispatchers.Main) { coordinator.saveWork(123) }
                withTimeout(10_000) { coordinator.debugEntries.first { entries -> entries.any { it.message == "Background download service started." } } }
                assertTrue(service()?.foreground == true)
                scenario.moveToState(Lifecycle.State.CREATED)
                withTimeout(10_000) { coordinator.isForeground.first { !it } }
                shell("input keyevent KEYCODE_SLEEP")
                withTimeout(10_000) { while (power.isInteractive) delay(50) }
                assertTrue(service()?.foreground == true)
                assertTrue(coordinator.hasPendingDownloads.value)
                assertNotNull(store.nextJob(store.context.value!!))
                assertTrue(accounts.database.chapterDao().getAllChaptersIncludingDeletedOnce().isEmpty())
                withContext(Dispatchers.Main) { coordinator.remove(123).join() }
                withTimeout(10_000) { while (service() != null) delay(50) }
                assertFalse(coordinator.hasPendingDownloads.value)
            }
        } finally {
            shell("input keyevent KEYCODE_WAKEUP")
            shell("wm dismiss-keyguard")
            context.stopService(Intent(context, OfflineDownloadService::class.java))
            scope.coroutineContext[Job]!!.cancelAndJoin()
            testKoin.close()
            accounts.close()
            directory.deleteRecursively()
        }
    }
}
