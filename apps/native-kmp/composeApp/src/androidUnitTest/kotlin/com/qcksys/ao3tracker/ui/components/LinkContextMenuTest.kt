package com.qcksys.ao3tracker.ui.components

import android.app.Activity
import android.app.Application
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Looper
import android.os.Message
import android.webkit.WebView
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.util.ReflectionHelpers
import org.robolectric.util.ReflectionHelpers.ClassParameter
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = Application::class)
class LinkContextMenuTest {
    private val activityController = Robolectric.buildActivity(Activity::class.java)
    private lateinit var webView: LinkWebView
    private var selectedLink: ReaderLink? = null

    @Before
    fun setUp() {
        val activity = activityController.setup().get()
        webView = LinkWebView(activity)
        activity.setContentView(webView)
        webView.installLinkContextMenu { selectedLink = it }
    }

    @After
    fun tearDown() {
        webView.destroy()
        activityController.pause().stop().destroy()
    }

    @Test
    fun `long press opens the app menu and copy preserves query and fragment`() {
        val url = "https://archiveofourown.org/works/123?view_full_work=true#chapter_4"
        assertTrue(longPress(WebView.HitTestResult.SRC_ANCHOR_TYPE, url))
        val link = assertNotNull(selectedLink)
        assertEquals(url, link.url)
        assertEquals(123L, link.workId)
        webView.copyLink(link)
        assertEquals(url, webView.context.getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.text)
        assertNull(shadowOf(activityController.get()).nextStartedActivity)
    }

    @Test
    fun `open targets a browser instead of the AO3 app link handler`() {
        val url = "https://archiveofourown.org/works/123?view_full_work=true#chapter_4"
        longPress(WebView.HitTestResult.SRC_ANCHOR_TYPE, url)
        webView.openLinkInBrowser(assertNotNull(selectedLink))
        val intent = shadowOf(activityController.get()).nextStartedActivity
        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals(url, intent.dataString)
        assertEquals(Intent.ACTION_MAIN, intent.selector?.action)
        assertTrue(intent.selector!!.hasCategory(Intent.CATEGORY_APP_BROWSER))
    }

    @Test
    fun `linked images use their anchor URL and title rather than image source`() {
        val url = "https://archiveofourown.org/works/456"
        webView.anchorUrl = url
        webView.anchorTitle = "A work title"
        assertTrue(longPress(WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE, "https://example.org/image.png"))
        assertEquals(ReaderLink(url, "A work title"), selectedLink)
    }

    @Test
    fun `plain text images and editable fields keep their existing menus`() {
        listOf(WebView.HitTestResult.UNKNOWN_TYPE, WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.EDIT_TEXT_TYPE).forEach { type ->
            assertFalse(longPress(type, null))
            assertNull(selectedLink)
        }
    }

    @Test
    fun `missing image targets and blank links do not open the sheet`() {
        longPress(WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE, "https://example.org/image.png")
        assertNull(selectedLink)
        longPress(WebView.HitTestResult.SRC_ANCHOR_TYPE, " ")
        assertNull(selectedLink)
    }

    @Test
    fun `non-web schemes do not launch activities`() {
        listOf("javascript:alert(1)", "intent://example.org", "file:///private/file").forEach { url ->
            webView.openLinkInBrowser(ReaderLink(url))
            assertNull(shadowOf(activityController.get()).nextStartedActivity)
        }
    }

    @Test
    fun `navigation before link resolution discards the old menu`() {
        setHit(WebView.HitTestResult.SRC_ANCHOR_TYPE, "https://archiveofourown.org/works/123")
        shadowOf(webView).onLongClickListener.onLongClick(webView)
        webView.pageUrl = "https://archiveofourown.org/works/456"
        shadowOf(Looper.getMainLooper()).idle()
        assertNull(selectedLink)
    }

    private fun longPress(type: Int, extra: String?): Boolean {
        setHit(type, extra)
        val consumed = shadowOf(webView).onLongClickListener.onLongClick(webView)
        shadowOf(Looper.getMainLooper()).idle()
        return consumed
    }

    private fun setHit(type: Int, extra: String?) {
        webView.hit = ReflectionHelpers.newInstance(WebView.HitTestResult::class.java).apply {
            ReflectionHelpers.callInstanceMethod<Unit>(this, "setType", ClassParameter.from(Int::class.javaPrimitiveType, type))
            ReflectionHelpers.callInstanceMethod<Unit>(this, "setExtra", ClassParameter.from(String::class.java, extra))
        }
    }

    private class LinkWebView(context: Context) : WebView(context) {
        var hit = ReflectionHelpers.newInstance(HitTestResult::class.java)
        var anchorUrl: String? = null
        var anchorTitle: String? = null
        var pageUrl = "https://archiveofourown.org"

        override fun getHitTestResult(): HitTestResult = hit
        override fun getUrl(): String = pageUrl

        override fun requestFocusNodeHref(message: Message?) {
            if (message == null) return
            message.data.putString("url", anchorUrl)
            message.data.putString("title", anchorTitle)
            message.sendToTarget()
        }
    }
}
