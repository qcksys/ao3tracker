package com.qcksys.ao3tracker.ui.components

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

@Composable
actual fun Ao3LinkSettings() {
    val context = LocalContext.current
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Open AO3 links in this app", style = MaterialTheme.typography.titleMedium)
            Text(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    "In Android settings, choose to open links in this app, then add archiveofourown.org and www.archiveofourown.org. Android requires your approval to open AO3 links here."
                } else {
                    "In Android settings, choose Open by default to allow AO3 links to open here. You can change this choice at any time."
                },
                style = MaterialTheme.typography.bodyMedium
            )
            OutlinedButton(onClick = {
                val packageUri = Uri.parse("package:${context.packageName}")
                val action = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS
                } else {
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                }
                try {
                    context.startActivity(Intent(action, packageUri))
                } catch (_: ActivityNotFoundException) {
                    context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri))
                }
            }) {
                Text("Manage supported links")
            }
        }
    }
}
