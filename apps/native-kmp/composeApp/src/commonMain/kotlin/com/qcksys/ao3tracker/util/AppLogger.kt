package com.qcksys.ao3tracker.util

import io.github.aakira.napier.Napier
import com.qcksys.ao3tracker.diagnostics.Diagnostics

/**
 * Application-wide logging utility using Napier.
 * Provides structured logging with consistent tags.
 */
object AppLogger {
    private const val DEFAULT_TAG = "AO3Tracker"

    fun v(message: String, tag: String = DEFAULT_TAG, throwable: Throwable? = null) {
        Napier.v(message, throwable, tag)
    }

    fun d(message: String, tag: String = DEFAULT_TAG, throwable: Throwable? = null) {
        Napier.d(message, throwable, tag)
    }

    fun i(message: String, tag: String = DEFAULT_TAG, throwable: Throwable? = null) {
        Napier.i(message, throwable, tag)
    }

    fun w(message: String, tag: String = DEFAULT_TAG, throwable: Throwable? = null) {
        Napier.w(message, throwable, tag)
        Diagnostics.log("warning", tag)
    }

    fun e(message: String, tag: String = DEFAULT_TAG, throwable: Throwable? = null) {
        Napier.e(message, throwable, tag)
        Diagnostics.log("error", tag)
    }

    fun wtf(message: String, tag: String = DEFAULT_TAG, throwable: Throwable? = null) {
        Napier.wtf(message, throwable, tag)
        Diagnostics.log("error", tag)
    }
}
