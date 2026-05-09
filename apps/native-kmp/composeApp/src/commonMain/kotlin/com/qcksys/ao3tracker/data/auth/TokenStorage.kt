package com.qcksys.ao3tracker.data.auth

expect class TokenStorage() {
    fun getToken(): String?
    fun saveToken(token: String)
    fun clearToken()
}

expect fun getTokenStorage(): TokenStorage
