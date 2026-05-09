package com.qcksys.ao3tracker.data.model

/**
 * Base exception for application-specific errors.
 */
sealed class AppException(
    message: String,
    cause: Throwable? = null
) : Exception(message, cause)

/**
 * Network-related exceptions.
 */
sealed class NetworkException(
    message: String,
    cause: Throwable? = null
) : AppException(message, cause) {

    class ConnectionFailed(
        message: String = "Failed to connect to server",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    class Timeout(
        message: String = "Request timed out",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    class ServerError(
        val statusCode: Int,
        message: String = "Server error: $statusCode",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    class Unauthorized(
        message: String = "Authentication required",
        cause: Throwable? = null
    ) : NetworkException(message, cause)
}

/**
 * Data parsing/serialization exceptions.
 */
sealed class DataException(
    message: String,
    cause: Throwable? = null
) : AppException(message, cause) {

    class ParseError(
        message: String = "Failed to parse data",
        cause: Throwable? = null
    ) : DataException(message, cause)

    class ValidationError(
        message: String = "Data validation failed",
        cause: Throwable? = null
    ) : DataException(message, cause)

    class InvalidMessageType(
        val type: String?,
        message: String = "Unknown message type: $type"
    ) : DataException(message)
}

/**
 * WebView message types for type-safe message handling.
 */
sealed class WebViewMessage {
    data class WorkInfo(val event: WorkInfoEvent) : WebViewMessage()
    data class WorkTags(val event: WorkTagsEvent) : WebViewMessage()
    data class ChapterIndex(val event: WorkChapterIndexEvent) : WebViewMessage()
    data class ScrollProgress(val event: ScrollProgressEvent) : WebViewMessage()
    data class Unknown(val type: String?, val rawJson: String) : WebViewMessage()
}
