package com.qcksys.ao3tracker.webview

private val trustedAo3Url = Regex(
    "^https://(?:www\\.)?archiveofourown\\.org(?::443)?(?:[/?#]|$)",
    RegexOption.IGNORE_CASE
)

fun isTrustedAo3Url(url: String?): Boolean = url != null && trustedAo3Url.containsMatchIn(url)

fun isTrustedAo3Origin(protocol: String, host: String, port: Long): Boolean =
    protocol.equals("https", ignoreCase = true) &&
        (host.equals("archiveofourown.org", ignoreCase = true) || host.equals("www.archiveofourown.org", ignoreCase = true)) &&
        (port == 0L || port == 443L)

fun guardAo3Script(script: String): String = """
    (function() {
        if (location.protocol !== 'https:' ||
            !['archiveofourown.org', 'www.archiveofourown.org'].includes(location.hostname) ||
            (location.port !== '' && location.port !== '443')) return;
        $script
    })();
""".trimIndent()
