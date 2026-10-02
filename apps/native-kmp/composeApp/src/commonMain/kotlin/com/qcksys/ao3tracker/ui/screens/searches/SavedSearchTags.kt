package com.qcksys.ao3tracker.ui.screens.searches

import io.ktor.http.Url
import io.ktor.http.decodeURLPart

internal fun savedSearchTags(href: String): List<String> {
    val url = runCatching { Url(href) }.getOrNull() ?: return emptyList()
    val tags = linkedSetOf<String>()
    fun add(raw: String, field: String, excluded: Boolean = false) {
        val value = raw.trim().replace(Regex("\\s+"), " ")
        if (value.isEmpty()) return
        val label = if (value.all { it in '0'..'9' } && !field.endsWith("_names")) {
            val type = field.replace(Regex("_(?:names|ids?)$"), "")
                .removePrefix("other_").removePrefix("excluded_")
                .replace('_', ' ').replaceFirstChar { it.uppercase() }
            "$type #$value"
        } else value
        tags.add(if (excluded) "Exclude: $label" else label)
    }
    fun tagName(value: String) = value.replace("*s*", "/").replace("*a*", "&")
        .replace("*d*", ".").replace("*q*", "?").replace("*h*", "#")

    Regex("/tags/([^/]+)").find(url.encodedPath)?.groupValues?.get(1)?.let { encoded ->
        runCatching { encoded.decodeURLPart() }.getOrNull()?.let { add(tagName(it), "tag_id") }
    }
    for ((key, values) in url.parameters.entries()) {
        if (key == "tag_id" || key == "fandom_id") {
            values.forEach { add(tagName(it), key) }
            continue
        }
        val match = Regex("^(?:(include|exclude)_)?(?:work|bookmark)_search\\[([a-z_]+)\\](?:\\[\\])?$")
            .matchEntire(key) ?: continue
        val field = match.groupValues[2]
        if (!Regex("^(?:(?:other|excluded)_)?(?:bookmark_tag|tag|fandom|relationship|character|freeform|rating|category|archive_warning)_(?:names|ids?)$").matches(field)) continue
        val excluded = match.groupValues[1] == "exclude" || field.startsWith("excluded_")
        values.forEach { raw -> raw.split(',').forEach { add(it, field, excluded) } }
    }
    return tags.toList()
}
