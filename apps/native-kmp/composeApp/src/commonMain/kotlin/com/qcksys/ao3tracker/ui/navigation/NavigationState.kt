package com.qcksys.ao3tracker.ui.navigation

import com.qcksys.ao3tracker.data.model.TagType
import com.qcksys.ao3tracker.webview.isTrustedAo3Url
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Shared navigation state for cross-tab communication.
 * Used to navigate from Track tab to Read tab with a specific URL and scroll position.
 *
 * This is a singleton to allow cross-tab communication in a tab-based navigation
 * where tabs don't share a common parent navigator scope.
 *
 * Note: Navigator references are stored as nullable and should be cleared
 * when no longer needed to prevent memory leaks.
 */
object NavigationState {
    private val _pendingNavigation = MutableStateFlow<ReadNavigation?>(null)
    val pendingNavigation: StateFlow<ReadNavigation?> = _pendingNavigation.asStateFlow()

    private val _pendingTagFilter = MutableStateFlow<TagFilter?>(null)
    val pendingTagFilter: StateFlow<TagFilter?> = _pendingTagFilter.asStateFlow()

    private val _navigateReadToHome = MutableStateFlow(false)
    val navigateReadToHome: StateFlow<Boolean> = _navigateReadToHome.asStateFlow()

    // Track tab navigator reference - should be cleared when tab is disposed
    private var trackTabNavigator: TabNavigatorContract? = null

    fun navigateToRead(url: String, scrollProgress: Float? = 0f) {
        _pendingNavigation.value = ReadNavigation(url, scrollProgress)
    }

    fun navigateToExternalAo3Url(url: String?) {
        if (url == null || !isTrustedAo3Url(url)) return
        _pendingNavigation.value = ReadNavigation(url, scrollProgress = null)
    }

    fun clearPendingNavigation() {
        _pendingNavigation.value = null
    }

    fun navigateToTrackWithTag(tagType: TagType, tag: String) {
        _pendingTagFilter.value = TagFilter(tagType, tag)
    }

    fun clearPendingTagFilter() {
        _pendingTagFilter.value = null
    }

    fun registerTrackTabNavigator(navigator: TabNavigatorContract) {
        trackTabNavigator = navigator
    }

    fun unregisterTrackTabNavigator() {
        trackTabNavigator = null
    }

    fun popTrackTabToRoot() {
        trackTabNavigator?.popToRoot()
    }

    fun triggerReadTabHome() {
        _navigateReadToHome.value = true
    }

    fun clearReadTabHome() {
        _navigateReadToHome.value = false
    }

    /**
     * Clears all navigation state. Call this when the app is being destroyed
     * or when you need to reset navigation state.
     */
    fun clearAll() {
        _pendingNavigation.value = null
        _pendingTagFilter.value = null
        _navigateReadToHome.value = false
        trackTabNavigator = null
    }
}

/**
 * Interface for tab navigator operations to decouple from Voyager Navigator.
 */
interface TabNavigatorContract {
    fun popToRoot()
}

data class ReadNavigation(
    val url: String,
    val scrollProgress: Float?
)

data class TagFilter(
    val tagType: TagType,
    val tag: String
)
