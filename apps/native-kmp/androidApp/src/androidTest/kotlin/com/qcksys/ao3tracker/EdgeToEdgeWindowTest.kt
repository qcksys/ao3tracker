package com.qcksys.ao3tracker

import android.os.Build
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs

@RunWith(AndroidJUnit4::class)
class EdgeToEdgeWindowTest {
    @Test
    fun systemBarIconsMatchTheDarkAppThemeAndKeyboardInsetsAreEnabled() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                assertIs<AndroidApplication>(activity.application)
                assertEquals(37, activity.applicationInfo.targetSdkVersion)
                assertEquals(BuildConfig.VERSION_NAME, appBuildInfo().version)
                assertEquals(BuildConfig.VERSION_CODE.toString(), appBuildInfo().buildNumber)
                val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
                assertFalse(controller.isAppearanceLightStatusBars)
                assertFalse(controller.isAppearanceLightNavigationBars)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    assertEquals(
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS,
                        activity.window.attributes.layoutInDisplayCutoutMode
                    )
                }
                assertEquals(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
                    activity.window.attributes.softInputMode and WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST
                )
            }
        }
    }
}
