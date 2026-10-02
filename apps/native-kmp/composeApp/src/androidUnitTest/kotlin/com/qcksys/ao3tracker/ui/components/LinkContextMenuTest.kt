package com.qcksys.ao3tracker.ui.components

import android.app.Activity
import android.app.Application
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Looper
import android.os.Message
import android.view.ContextMenu
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
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = Application::class)
class LinkContextMenuTest {
    private val activityController = Robolectric.buildActivity(Activity::class.java)
    private lateinit var webView: LinkWebView

    @Before
    fun setUp() {
        val activity = activityController.setup().get()
        webView = LinkWebView(activity)
        activity.setContentView(webView)
        webView.installLinkContextMenu()
    }

    @After
    fun tearDown() {
        webView.destroy()
        activityController.pause().stop().destroy()
    }

    @Test
    fun `copy preserves the pressed link including its query and fragment`() {
        val url = "https://archiveofourown.org/works/123?view_full_work=true#chapter_4"
        val menu = menuFor(WebView.HitTestResult.SRC_ANCHOR_TYPE, url)

        assertEquals(listOf("Copy", "Open in browser"), (0 until menu.size()).map { menu.getItem(it).title })
        assertTrue(menu.performIdentifierAction(android.R.id.copy, 0))
        assertEquals(url, clipboardText())
        assertNull(shadowOf(activityController.get()).nextStartedActivity)
    }

    @Test
    fun `open targets a browser instead of the AO3 app link handler`() {
        val url = "https://archiveofourown.org/works/123?view_full_work=true#chapter_4"
        val menu = menuFor(WebView.HitTestResult.SRC_ANCHOR_TYPE, url)

        assertTrue(menu.performIdentifierAction(android.R.id.button1, 0))
        val intent = shadowOf(activityController.get()).nextStartedActivity
        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals(url, intent.dataString)
        assertEquals(Intent.ACTION_MAIN, intent.selector?.action)
        assertTrue(intent.selector!!.hasCategory(Intent.CATEGORY_APP_BROWSER))
    }

    @Test
    fun `linked images copy and open their anchor rather than the image source`() {
        val url = "https://example.org/story?part=2#end"
        webView.anchorUrl = url
        val menu = menuFor(WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE, "https://example.org/image.png")

        menu.performIdentifierAction(android.R.id.copy, 0)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(url, clipboardText())

        menu.performIdentifierAction(android.R.id.button1, 0)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(url, shadowOf(activityController.get()).nextStartedActivity.dataString)
    }

    @Test
    fun `plain text images and editable fields keep their existing menus`() {
        listOf(WebView.HitTestResult.UNKNOWN_TYPE, WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.EDIT_TEXT_TYPE).forEach { type ->
            assertEquals(0, menuFor(type, null).size())
        }
    }

    @Test
    fun `missing image targets and non-web schemes do not launch activities`() {
        menuFor(WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE, "https://example.org/image.png")
            .performIdentifierAction(android.R.id.button1, 0)
        shadowOf(Looper.getMainLooper()).idle()
        assertNull(shadowOf(activityController.get()).nextStartedActivity)

        listOf("javascript:alert(1)", "intent://example.org", "file:///private/file").forEach { url ->
            menuFor(WebView.HitTestResult.SRC_ANCHOR_TYPE, url)
                .performIdentifierAction(android.R.id.button1, 0)
            assertNull(shadowOf(activityController.get()).nextStartedActivity)
        }
    }

    private fun clipboardText(): CharSequence? =
        webView.context.getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.text

    private fun menuFor(type: Int, extra: String?): ContextMenu {
        webView.hit = ReflectionHelpers.newInstance(WebView.HitTestResult::class.java).apply {
            ReflectionHelpers.callInstanceMethod<Unit>(this, "setType", ClassParameter.from(Int::class.javaPrimitiveType, type))
            ReflectionHelpers.callInstanceMethod<Unit>(this, "setExtra", ClassParameter.from(String::class.java, extra))
        }
        val menu = Class.forName("com.android.internal.view.menu.ContextMenuBuilder")
            .getConstructor(Context::class.java).newInstance(webView.context) as ContextMenu
        webView.createContextMenu(menu)
        return menu
    }

    private class LinkWebView(context: Context) : WebView(context) {
        var hit = ReflectionHelpers.newInstance(HitTestResult::class.java)
        var anchorUrl: String? = null

        override fun getHitTestResult(): HitTestResult = hit

        override fun requestFocusNodeHref(message: Message?) {
            if (message == null) return
            message.data.putString("url", anchorUrl)
            message.sendToTarget()
        }
    }
}
