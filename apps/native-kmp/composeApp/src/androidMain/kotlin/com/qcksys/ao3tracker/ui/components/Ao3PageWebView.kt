package com.qcksys.ao3tracker.ui.components

import android.content.Context
import android.content.res.Configuration
import android.view.ContextThemeWrapper
import android.webkit.WebView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

internal class Ao3PageWebView(context: Context) : WebView(ContextThemeWrapper(context, pageTheme(context.resources.configuration))) {
    init {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        (context as ContextThemeWrapper).setTheme(pageTheme(newConfig))
        super.onConfigurationChanged(newConfig)
    }
}

private fun pageTheme(configuration: Configuration): Int =
    if (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES)
        android.R.style.Theme_Material_NoActionBar
    else android.R.style.Theme_Material_Light_NoActionBar
