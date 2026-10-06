package com.qcksys.ao3tracker.util

private val invalidPercentEscape = Regex("%(?![0-9a-fA-F]{2})")

internal fun hasValidPercentEncoding(url: String): Boolean = !invalidPercentEscape.containsMatchIn(url)
