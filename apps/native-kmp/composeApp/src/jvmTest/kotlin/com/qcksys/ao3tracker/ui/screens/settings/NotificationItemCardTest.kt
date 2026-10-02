package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.qcksys.ao3tracker.data.push.NotificationItem
import com.qcksys.ao3tracker.data.push.NotificationType
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import com.qcksys.ao3tracker.ui.navigation.ReadNavigation
import kotlin.test.assertEquals
import kotlin.test.assertNull
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class NotificationItemCardTest(private val type: NotificationType) {
    @get:Rule
    val rule = createComposeRule()

    @Before
    @After
    fun clearNavigation() {
        NavigationState.clearPendingNavigation()
    }

    @Test
    fun tappingHistoryEntryOpensItsWorkAndDismissesHistory() {
        val notification = NotificationItem(
            id = 42,
            workId = 123456,
            type = type,
            title = "A tracked work",
            body = "This work has an update",
            createdAt = "2026-10-02T00:00:00Z"
        )
        var showHistory by mutableStateOf(true)
        rule.setContent {
            MaterialTheme {
                if (showHistory) {
                    NotificationItemCard(notification, onDismiss = { showHistory = false })
                }
            }
        }

        assertNull(NavigationState.pendingNavigation.value)
        rule.onNodeWithText(notification.body).performClick()

        assertEquals(
            ReadNavigation("https://archiveofourown.org/works/123456", 0f),
            NavigationState.pendingNavigation.value
        )
        rule.onNodeWithText(notification.title).assertDoesNotExist()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun notificationTypes() = NotificationType.entries.map { arrayOf(it) }
    }
}
