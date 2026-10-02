package com.qcksys.ao3tracker.ui.components

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.widget.Toast

internal fun WebView.installLinkContextMenu(onLink: (ReaderLink) -> Unit) {
    setOnLongClickListener {
        val hit = hitTestResult
        if (hit.type != WebView.HitTestResult.SRC_ANCHOR_TYPE &&
            hit.type != WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE
        ) return@setOnLongClickListener false

        val pageUrl = url
        // Linked-image hit tests contain the image source, not the anchor URL.
        val fallbackUrl = hit.extra.takeIf { hit.type == WebView.HitTestResult.SRC_ANCHOR_TYPE }
        val handler = Handler(Looper.getMainLooper()) { message ->
            val linkUrl = message.data.getString("url")?.takeIf { it.isNotBlank() } ?: fallbackUrl
            if (url == pageUrl && !linkUrl.isNullOrBlank()) {
                onLink(ReaderLink(linkUrl, message.data.getString("title")?.trim()?.takeIf { it.isNotEmpty() }))
            }
            true
        }
        requestFocusNodeHref(handler.obtainMessage())
        true
    }
}

internal fun WebView.copyLink(link: ReaderLink) {
    context.getSystemService(ClipboardManager::class.java)
        .setPrimaryClip(ClipData.newPlainText("Link", link.url))
}

internal fun WebView.openLinkInBrowser(link: ReaderLink) {
    val uri = Uri.parse(link.url)
    if (uri.scheme.equals("https", ignoreCase = true) || uri.scheme.equals("http", ignoreCase = true)) {
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            // Resolve a browser even when AO3 links are assigned to this app.
            selector = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_BROWSER)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(context, "No browser available", Toast.LENGTH_SHORT).show()
        }
    }
}
