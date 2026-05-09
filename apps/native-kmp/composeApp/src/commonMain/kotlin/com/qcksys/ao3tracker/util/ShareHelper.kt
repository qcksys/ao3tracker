package com.qcksys.ao3tracker.util

/**
 * Shares text content using the platform's share mechanism.
 * On Android: Opens share sheet
 * On Desktop: Opens save file dialog
 * On iOS: Opens share sheet
 */
expect fun shareText(text: String, filename: String, mimeType: String)
