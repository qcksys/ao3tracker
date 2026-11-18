package com.qcksys.ao3tracker.data.settings

import com.qcksys.ao3tracker.data.backup.DriveBackupLocation
import kotlinx.serialization.Serializable

@Serializable
data class DriveBackupPreferences(
    /** Email of the connected Google account; null when signed out of Google. */
    val account: String? = null,
    val location: DriveBackupLocation = DriveBackupLocation.MY_DRIVE,
    /** Random per-install ID that keeps this device's backups apart from other devices'. */
    val deviceId: String? = null,
    val lastBackupAt: Long? = null
)
