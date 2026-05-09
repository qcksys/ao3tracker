package com.qcksys.ao3tracker.util

import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSURL
import platform.Foundation.writeToFile
import platform.UIKit.UIActivityViewController
import platform.UIKit.UIApplication

actual fun shareText(text: String, filename: String, mimeType: String) {
    val tempDir = NSTemporaryDirectory()
    val filePath = "$tempDir$filename"

    // Write text to temporary file
    @Suppress("CAST_NEVER_SUCCEEDS")
    (text as NSString).writeToFile(filePath, atomically = true, encoding = NSUTF8StringEncoding)

    val fileUrl = NSURL.fileURLWithPath(filePath)

    val activityViewController = UIActivityViewController(
        activityItems = listOf(fileUrl),
        applicationActivities = null
    )

    val rootViewController = UIApplication.sharedApplication.keyWindow?.rootViewController
    rootViewController?.presentViewController(activityViewController, animated = true, completion = null)
}

private typealias NSString = platform.Foundation.NSString
private const val NSUTF8StringEncoding: ULong = 4u
