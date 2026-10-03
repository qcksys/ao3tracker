package com.qcksys.ao3tracker.data.offline

import android.content.Context
import java.io.File

private lateinit var offlineFiles: OfflineFiles

fun initializeOfflineFiles(context: Context) {
    offlineFiles = DiskOfflineFiles(File(context.applicationContext.noBackupFilesDir, "offline-reading"))
}

internal actual fun getOfflineFiles(): OfflineFiles = offlineFiles
