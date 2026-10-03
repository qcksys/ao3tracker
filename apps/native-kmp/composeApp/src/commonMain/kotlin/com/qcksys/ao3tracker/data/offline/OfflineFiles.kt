package com.qcksys.ao3tracker.data.offline

internal data class OfflineFileScope(val owner: String, val context: String)

internal interface OfflineFiles {
    fun put(scope: OfflineFileScope, key: String, bytes: ByteArray)
    fun read(scope: OfflineFileScope, key: String, limit: Int): ByteArray?
    fun keys(scope: OfflineFileScope): List<String>
    fun size(scope: OfflineFileScope, key: String): Long
    fun remove(scope: OfflineFileScope, key: String)
    fun contexts(owner: String): List<String>
    fun removeContext(scope: OfflineFileScope)
}

internal expect fun getOfflineFiles(): OfflineFiles

internal object UnsupportedOfflineFiles : OfflineFiles {
    override fun put(scope: OfflineFileScope, key: String, bytes: ByteArray) = error("Offline downloads are not supported on this platform")
    override fun read(scope: OfflineFileScope, key: String, limit: Int): ByteArray? = null
    override fun keys(scope: OfflineFileScope): List<String> = emptyList()
    override fun size(scope: OfflineFileScope, key: String): Long = 0
    override fun remove(scope: OfflineFileScope, key: String) = Unit
    override fun contexts(owner: String): List<String> = emptyList()
    override fun removeContext(scope: OfflineFileScope) = Unit
}
