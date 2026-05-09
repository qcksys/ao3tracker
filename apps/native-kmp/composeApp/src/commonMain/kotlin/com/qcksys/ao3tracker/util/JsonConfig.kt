package com.qcksys.ao3tracker.util

import kotlinx.serialization.json.Json

/**
 * Shared JSON configuration for the application.
 * Use this singleton for all JSON serialization/deserialization.
 */
object JsonConfig {
    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = false  // Don't encode null values - API expects omission for optional fields
        explicitNulls = false   // Omit null values from serialization
        coerceInputValues = true
    }
}
