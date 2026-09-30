package com.qcksys.ao3tracker.data.auth

interface SessionTokenStorage {
    fun getToken(): String?
    fun saveToken(token: String)
    fun clearToken()
}

expect class TokenStorage() : SessionTokenStorage {
    override fun getToken(): String?
    override fun saveToken(token: String)
    override fun clearToken()
}

expect fun getTokenStorage(): TokenStorage
