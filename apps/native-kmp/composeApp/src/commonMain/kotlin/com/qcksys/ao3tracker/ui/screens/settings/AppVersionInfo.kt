package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextAlign
import com.qcksys.ao3tracker.AppBuildInfo
import com.qcksys.ao3tracker.appBuildInfo

@Composable
internal fun AppVersionInfo(info: AppBuildInfo = appBuildInfo()) {
    Text(
        text = "Version ${info.version}" + (info.buildNumber?.let { " ($it)" } ?: ""),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center
    )
    Text(
        text = "Built ${info.buildTimeUtc}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center
    )
}
