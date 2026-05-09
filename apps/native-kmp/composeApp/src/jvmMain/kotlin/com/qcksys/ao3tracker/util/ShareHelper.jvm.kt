package com.qcksys.ao3tracker.util

import java.awt.FileDialog
import java.awt.Frame
import java.io.File
import javax.swing.SwingUtilities

actual fun shareText(text: String, filename: String, mimeType: String) {
    SwingUtilities.invokeLater {
        val dialog = FileDialog(null as Frame?, "Save Export", FileDialog.SAVE)
        dialog.file = filename
        dialog.isVisible = true

        val directory = dialog.directory
        val file = dialog.file

        if (directory != null && file != null) {
            try {
                File(directory, file).writeText(text)
            } catch (e: Exception) {
                AppLogger.e("Failed to save file: ${e.message}", "ShareHelper", e)
            }
        }
    }
}
