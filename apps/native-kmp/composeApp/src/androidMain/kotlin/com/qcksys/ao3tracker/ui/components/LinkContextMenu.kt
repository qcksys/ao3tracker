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

internal fun WebView.installLinkContextMenu() {
    setOnCreateContextMenuListener { menu, _, _ ->
        val hit = hitTestResult
        if (hit.type != WebView.HitTestResult.SRC_ANCHOR_TYPE &&
            hit.type != WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE
        ) return@setOnCreateContextMenuListener

        fun withLinkUrl(action: (String) -> Unit) {
            if (hit.type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) {
                // The hit-test extra contains the image URL, not the enclosing link.
                val handler = Handler(Looper.getMainLooper()) { message ->
                    message.data.getString("url")?.takeIf { it.isNotBlank() }?.let(action)
                    true
                }
                requestFocusNodeHref(handler.obtainMessage())
            } else {
                hit.extra?.takeIf { it.isNotBlank() }?.let(action)
            }
        }

        menu.add(0, android.R.id.copy, 0, "Copy").setOnMenuItemClickListener {
            withLinkUrl { linkUrl ->
                context.getSystemService(ClipboardManager::class.java)
                    .setPrimaryClip(ClipData.newPlainText("Link", linkUrl))
            }
            true
        }
        menu.add(0, android.R.id.button1, 1, "Open in browser").setOnMenuItemClickListener {
            withLinkUrl { linkUrl ->
                val uri = Uri.parse(linkUrl)
                if (uri.scheme.equals("https", ignoreCase = true) ||
                    uri.scheme.equals("http", ignoreCase = true)
                ) {
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
            true
        }
    }
}
