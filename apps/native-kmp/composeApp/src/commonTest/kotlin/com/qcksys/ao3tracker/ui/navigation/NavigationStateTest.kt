package com.qcksys.ao3tracker.ui.navigation

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalCoroutinesApi::class)
class NavigationStateTest {
    @AfterTest
    fun clearNavigation() {
        NavigationState.clearAll()
    }

    @Test
    fun `external links preserve chapters queries and fragments without forcing scroll`() {
        val urls = listOf(
            "https://archiveofourown.org/works/123/chapters/456?view_adult=true#comment_789",
            "https://www.archiveofourown.org/tags/Space%20Opera/works?work_search%5Bsort_column%5D=revised_at",
            "https://ARCHIVEOFOUROWN.ORG:443/works/123#chapters"
        )
        urls.forEach { url ->
            NavigationState.navigateToExternalAo3Url(url)
            assertEquals(ReadNavigation(url, null), NavigationState.pendingNavigation.value)
        }
    }

    @Test
    fun `external links reject untrusted schemes authorities and ports`() {
        val urls = listOf(
            null,
            "http://archiveofourown.org/works/123",
            "https://archiveofourown.org.evil.test/works/123",
            "https://archiveofourown.org@evil.test/works/123",
            "https://archiveofourown.org:8443/works/123",
            "https://archiveofourown.org\\@evil.test/works/123",
            "https://evil.test/?url=https://archiveofourown.org/works/123",
            "javascript:alert(1)",
            "file:///works/123"
        )
        urls.forEach { url ->
            NavigationState.navigateToExternalAo3Url(url)
            assertNull(NavigationState.pendingNavigation.value, url)
        }
    }

    @Test
    fun `invalid external link leaves pending reader navigation unchanged`() {
        NavigationState.navigateToRead("https://archiveofourown.org/works/123", 0.5f)
        NavigationState.navigateToExternalAo3Url("https://example.com")
        assertEquals(
            ReadNavigation("https://archiveofourown.org/works/123", 0.5f),
            NavigationState.pendingNavigation.value
        )
    }

    @Test
    fun `live work navigation opens the AO3 work page instead of a saved copy`() {
        NavigationState.navigateToLiveWork(123)
        assertEquals(
            ReadNavigation("https://archiveofourown.org/works/123", 0f, live = true),
            NavigationState.pendingNavigation.value
        )
    }

    @Test
    fun `download notification requests stay pending until the Works tab consumes them`() {
        assertFalse(NavigationState.pendingDownloads.value)
        NavigationState.navigateToDownloads()
        assertTrue(NavigationState.pendingDownloads.value)
        assertNull(NavigationState.pendingNavigation.value)
        NavigationState.clearPendingDownloads()
        assertFalse(NavigationState.pendingDownloads.value)
    }

    @Test
    fun `reselecting Works returns to the list before scrolling it to the top`() = runTest {
        val scrolls = mutableListOf<Unit>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            NavigationState.worksScrollToTop.collect { scrolls += it }
        }
        val navigator = FakeTabNavigator(depth = 2)
        NavigationState.registerTrackTabNavigator(navigator)

        NavigationState.reselectTrackTab()
        assertEquals(1, navigator.depth)
        assertTrue(scrolls.isEmpty())

        NavigationState.reselectTrackTab()
        assertEquals(1, navigator.depth)
        assertEquals(1, scrolls.size)
    }

    @Test
    fun `Works scroll requests are dropped while no list is collecting them`() = runTest {
        NavigationState.reselectTrackTab()
        val scrolls = mutableListOf<Unit>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            NavigationState.worksScrollToTop.collect { scrolls += it }
        }
        assertTrue(scrolls.isEmpty())
    }

    @Test
    fun `internal and notification navigation retain default scroll behavior`() {
        NavigationState.navigateToRead("https://archiveofourown.org/works/123")
        assertEquals(0f, NavigationState.pendingNavigation.value?.scrollProgress)
    }

    private class FakeTabNavigator(var depth: Int) : TabNavigatorContract {
        override val isAtRoot get() = depth == 1
        override fun popToRoot() { depth = 1 }
    }
}
