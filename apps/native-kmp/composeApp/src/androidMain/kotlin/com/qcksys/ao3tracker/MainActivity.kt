package com.qcksys.ao3tracker

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.core.content.ContextCompat
import androidx.compose.ui.tooling.preview.Preview
import com.qcksys.ao3tracker.data.auth.getAndroidCredentialHelper
import com.qcksys.ao3tracker.data.auth.initializeCredentialHelper
import com.qcksys.ao3tracker.data.auth.initializeTokenStorage
import com.qcksys.ao3tracker.data.database.initializeDatabase
import com.qcksys.ao3tracker.data.push.initializePushTokenStorage
import com.qcksys.ao3tracker.data.settings.initializeSettingsStorage
import com.qcksys.ao3tracker.push.Ao3FirebaseMessagingService
import com.qcksys.ao3tracker.util.initializeShareHelper
import io.github.aakira.napier.Napier

class MainActivity : ComponentActivity() {

    // Notification permission request launcher (Android 13+)
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        Napier.d("Notification permission ${if (isGranted) "granted" else "denied"}")
    }

    // Pending work ID to navigate to after app initialization
    private var pendingWorkId: Long? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // Initialize database with context
        initializeDatabase(applicationContext)

        // Initialize token storage with context
        initializeTokenStorage(applicationContext)

        // Initialize settings storage with context
        initializeSettingsStorage(applicationContext)

        // Initialize credential helper with context
        initializeCredentialHelper(applicationContext)

        // Initialize share helper with context
        initializeShareHelper(applicationContext)

        // Initialize push token storage with context
        initializePushTokenStorage(applicationContext)

        // Request notification permission (Android 13+)
        requestNotificationPermissionIfNeeded()

        // Handle deep link from notification (if app was launched from notification)
        handleNotificationIntent(intent)

        setContent {
            App()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNotificationIntent(intent)
    }

    /**
     * Requests notification permission on Android 13+ if not already granted.
     */
    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val permission = Manifest.permission.POST_NOTIFICATIONS
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(permission)
            }
        }
    }

    /**
     * Handles notification deep links to open a specific work.
     */
    private fun handleNotificationIntent(intent: Intent?) {
        if (intent?.action == Ao3FirebaseMessagingService.ACTION_OPEN_WORK) {
            val workId = intent.getLongExtra(Ao3FirebaseMessagingService.EXTRA_WORK_ID, -1)
            if (workId > 0) {
                Napier.d("Notification deep link: opening work $workId")
                pendingWorkId = workId
                // TODO: Navigate to work detail screen
                // This would require a navigation state holder accessible from here
                // For now, the workId is stored and can be consumed by the app
            }
        }
    }

    /**
     * Gets and clears the pending work ID from a notification deep link.
     * Call this from the app's navigation setup to handle the deep link.
     */
    fun consumePendingWorkId(): Long? {
        val workId = pendingWorkId
        pendingWorkId = null
        return workId
    }

    override fun onResume() {
        super.onResume()
        getAndroidCredentialHelper()?.setActivity(this)
    }

    override fun onPause() {
        super.onPause()
        getAndroidCredentialHelper()?.setActivity(null)
    }
}

@Preview
@Composable
fun AppAndroidPreview() {
    App()
}
