package com.qcksys.ao3tracker.data.offline

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlin.uuid.Uuid

internal class DiskOfflineFiles(root: File) : OfflineFiles {
    private val root = root.canonicalFile
    private val hashPattern = Regex("[a-f0-9]{64}")
    private val contextPattern = Regex("[a-f0-9-]{36}")
    private val pendingPattern = Regex("pending-[a-f0-9-]{36}")

    private fun ownerDirectory(owner: String): File {
        require(hashPattern.matches(owner))
        return File(root, owner).also { require(it.canonicalFile.parentFile == root) }
    }

    private fun directory(scope: OfflineFileScope): File {
        require(contextPattern.matches(scope.context))
        val owner = ownerDirectory(scope.owner)
        return File(owner, scope.context).also { require(it.canonicalFile.parentFile == owner) }
    }

    private fun file(scope: OfflineFileScope, key: String, allowPending: Boolean = false): File {
        require(hashPattern.matches(key) || allowPending && pendingPattern.matches(key))
        val directory = directory(scope)
        return File(directory, key).also { require(it.canonicalFile.parentFile == directory) }
    }

    @Synchronized
    override fun put(scope: OfflineFileScope, key: String, bytes: ByteArray) {
        try {
            putFile(scope, key, bytes)
        } catch (_: IOException) {
            throw OfflineStorageUnavailable()
        }
    }

    private fun putFile(scope: OfflineFileScope, key: String, bytes: ByteArray) {
        val destination = file(scope, key)
        val directory = destination.parentFile!!
        if (!directory.isDirectory && !directory.mkdirs()) throw IOException("Unable to create download storage")
        if (read(scope, key, bytes.size)?.contentEquals(bytes) == true) return
        if (directory.usableSpace < bytes.size + 6L * 1024 * 1024) throw IOException("There is not enough space to save this chapter")
        val staged = file(scope, "pending-${Uuid.random()}", allowPending = true)
        try {
            FileOutputStream(staged).use { it.write(bytes); it.fd.sync() }
            if (destination.exists() && !destination.delete()) throw IOException("Unable to replace a damaged download")
            if (!staged.renameTo(destination)) throw IOException("Unable to publish the download")
        } finally {
            staged.delete()
        }
    }

    @Synchronized
    override fun read(scope: OfflineFileScope, key: String, limit: Int): ByteArray? {
        require(limit >= 0)
        val target = file(scope, key)
        if (!target.isFile || target.length() > limit) return null
        return try {
            target.inputStream().use { input ->
                val output = ByteArrayOutputStream(minOf(target.length().toInt(), 16_384))
                val buffer = ByteArray(16_384)
                var count = input.read(buffer)
                while (count >= 0) {
                    if (output.size() + count > limit) return null
                    output.write(buffer, 0, count)
                    count = input.read(buffer)
                }
                output.toByteArray()
            }
        } catch (_: IOException) { null }
    }

    @Synchronized
    override fun keys(scope: OfflineFileScope): List<String> = directory(scope).listFiles().orEmpty()
        .filter { it.isFile && (hashPattern.matches(it.name) || pendingPattern.matches(it.name)) }.map { it.name }

    @Synchronized
    override fun size(scope: OfflineFileScope, key: String): Long = file(scope, key).let { if (it.isFile) it.length() else 0L }

    @Synchronized
    override fun remove(scope: OfflineFileScope, key: String) {
        val target = file(scope, key, allowPending = true)
        if (target.exists() && !target.delete()) throw IOException("Unable to remove a download file")
    }

    @Synchronized
    override fun contexts(owner: String): List<String> = ownerDirectory(owner).listFiles().orEmpty()
        .filter { it.isDirectory && contextPattern.matches(it.name) }.map { it.name }

    @Synchronized
    override fun removeContext(scope: OfflineFileScope) {
        keys(scope).forEach { remove(scope, it) }
        val target = directory(scope)
        if (target.exists() && !target.delete()) throw IOException("Unable to remove download storage")
    }
}
