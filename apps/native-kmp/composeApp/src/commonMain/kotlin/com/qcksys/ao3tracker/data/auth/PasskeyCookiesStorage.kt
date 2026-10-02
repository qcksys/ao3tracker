package com.qcksys.ao3tracker.data.auth

import io.ktor.client.plugins.cookies.AcceptAllCookiesStorage
import io.ktor.client.plugins.cookies.CookiesStorage
import io.ktor.http.Cookie
import io.ktor.http.Url
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal class PasskeyCookiesStorage : CookiesStorage {
    private val cookies = mutableMapOf<String, AcceptAllCookiesStorage>()
    private val mutex = Mutex()

    override suspend fun addCookie(requestUrl: Url, cookie: Cookie) {
        if (cookie.name.removePrefix("__Secure-") == "better-auth.better-auth-passkey") {
            mutex.withLock {
                cookies.getOrPut(origin(requestUrl)) { AcceptAllCookiesStorage() }.addCookie(requestUrl, cookie)
            }
        }
    }

    override suspend fun get(requestUrl: Url): List<Cookie> = mutex.withLock {
        if (requestUrl.encodedPath.contains("/passkey/")) {
            cookies[origin(requestUrl)]?.get(requestUrl).orEmpty()
        } else emptyList()
    }

    override fun close() { cookies.values.forEach { it.close() } }

    private fun origin(url: Url) = "${url.protocol.name}://${url.host}:${url.port}"
}
