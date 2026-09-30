package com.qcksys.ao3tracker.ui.navigation

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

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
    fun `internal and notification navigation retain default scroll behavior`() {
        NavigationState.navigateToRead("https://archiveofourown.org/works/123")
        assertEquals(0f, NavigationState.pendingNavigation.value?.scrollProgress)
    }
}
