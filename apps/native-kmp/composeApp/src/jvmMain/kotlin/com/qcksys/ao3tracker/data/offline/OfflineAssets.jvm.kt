package com.qcksys.ao3tracker.data.offline

import java.security.MessageDigest

internal actual fun offlineSha256(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { (it.toInt() and 255).toString(16).padStart(2, '0') }
