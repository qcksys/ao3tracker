package com.qcksys.ao3tracker.ui.screens.settings

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

@Composable
internal actual fun rememberNotificationPermissionRequest(onGranted: () -> Unit): (() -> Unit)? {
    val context = LocalContext.current
    val activity = LocalActivity.current
    val manager = remember(context) { NotificationManagerCompat.from(context) }
    var allowed by remember { mutableStateOf(manager.areNotificationsEnabled()) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { allowed = manager.areNotificationsEnabled() }

    val attempts = remember(context) { context.getSharedPreferences("notification_permission", Context.MODE_PRIVATE) }
    val permission = Manifest.permission.POST_NOTIFICATIONS
    val request = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        allowed = manager.areNotificationsEnabled()
        if (granted && allowed) onGranted()
    }
    val settings = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        allowed = manager.areNotificationsEnabled()
        if (allowed) onGranted()
    }
    if (allowed) return null
    return {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            (!attempts.getBoolean("requested", false) || activity?.shouldShowRequestPermissionRationale(permission) == true)) {
            attempts.edit().putBoolean("requested", true).apply()
            request.launch(permission)
        } else {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
            }
            settings.launch(intent)
        }
    }
}
