package com.qcksys.ao3tracker.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertPositionInRootIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.navigator.tab.TabNavigator
import org.junit.Rule
import org.junit.Test

class MainScreenInsetsTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun contentAvoidsSystemBarsAndLandscapeCutoutsAfterRotation() {
        val insets = mutableStateOf(WindowInsets(left = 0.dp, top = 24.dp, right = 0.dp, bottom = 24.dp))
        rule.setContent {
            MaterialTheme {
                TabNavigator(TrackTab) {
                    Box(Modifier.size(400.dp, 600.dp)) {
                        MainScreenScaffold(false, insets.value) {
                            Box(Modifier.fillMaxSize().testTag("content"))
                        }
                    }
                }
            }
        }

        rule.onNodeWithTag("content")
            .assertPositionInRootIsEqualTo(0.dp, 24.dp)
            .assertWidthIsEqualTo(400.dp)
            .assertHeightIsEqualTo(472.dp)

        rule.runOnIdle {
            insets.value = WindowInsets(left = 40.dp, top = 24.dp, right = 32.dp, bottom = 0.dp)
        }
        rule.onNodeWithTag("content")
            .assertPositionInRootIsEqualTo(40.dp, 24.dp)
            .assertWidthIsEqualTo(328.dp)
            .assertHeightIsEqualTo(496.dp)
    }

    @Test
    fun nestedScreensDoNotApplyTheHandledInsetsAgain() {
        val insets = WindowInsets(left = 40.dp, top = 24.dp, right = 32.dp, bottom = 24.dp)
        rule.setContent {
            MaterialTheme {
                TabNavigator(TrackTab) {
                    Box(Modifier.size(400.dp, 600.dp)) {
                        MainScreenScaffold(false, insets) {
                            Box(Modifier.fillMaxSize().windowInsetsPadding(insets)) {
                                Box(Modifier.fillMaxSize().testTag("nested"))
                            }
                        }
                    }
                }
            }
        }

        rule.onNodeWithTag("nested")
            .assertPositionInRootIsEqualTo(40.dp, 24.dp)
            .assertWidthIsEqualTo(328.dp)
            .assertHeightIsEqualTo(472.dp)
    }
}
