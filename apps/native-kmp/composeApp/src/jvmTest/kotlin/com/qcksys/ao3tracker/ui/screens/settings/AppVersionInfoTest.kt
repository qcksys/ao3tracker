package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.qcksys.ao3tracker.AppBuildInfo
import com.qcksys.ao3tracker.appBuildInfo
import org.junit.Rule
import org.junit.Test
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import kotlin.test.assertEquals

class AppVersionInfoTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun displaysReleaseVersionBuildNumberAndUtcBuildTime() {
        rule.setContent {
            MaterialTheme {
                Column {
                    AppVersionInfo(AppBuildInfo("2026.10.2+010203-dev", "213066123", "2026-10-02 01:02:03 UTC"))
                }
            }
        }

        rule.onNodeWithText("Version 2026.10.2+010203-dev (213066123)").assertIsDisplayed()
        rule.onNodeWithText("Built 2026-10-02 01:02:03 UTC").assertIsDisplayed()
        rule.onNodeWithText("Version 0.1.0").assertDoesNotExist()
    }

    @Test
    fun displaysPackagedDesktopMetadataWithoutAnEmptyBuildNumber() {
        val info = appBuildInfo()
        assertEquals(null, info.buildNumber)
        LocalDateTime.parse(info.buildTimeUtc, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss 'UTC'"))
        rule.setContent {
            MaterialTheme {
                Column { AppVersionInfo() }
            }
        }

        rule.onNodeWithText("Version ${info.version}").assertIsDisplayed()
        rule.onNodeWithText("Built ${info.buildTimeUtc}").assertIsDisplayed()
    }
}
