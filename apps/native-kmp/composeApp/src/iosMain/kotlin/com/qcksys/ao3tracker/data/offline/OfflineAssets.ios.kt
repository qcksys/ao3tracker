package com.qcksys.ao3tracker.data.offline

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.CoreCrypto.CC_SHA256
import platform.CoreCrypto.CC_SHA256_DIGEST_LENGTH

@OptIn(ExperimentalForeignApi::class, ExperimentalUnsignedTypes::class)
internal actual fun offlineSha256(bytes: ByteArray): String {
    val output = UByteArray(CC_SHA256_DIGEST_LENGTH)
    val input = if (bytes.isEmpty()) byteArrayOf(0) else bytes
    input.usePinned { source ->
        output.usePinned { destination -> CC_SHA256(source.addressOf(0), bytes.size.toUInt(), destination.addressOf(0)) }
    }
    return output.joinToString("") { it.toString(16).padStart(2, '0') }
}
