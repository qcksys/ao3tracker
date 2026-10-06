package com.qcksys.ao3tracker.data.settings

import android.app.Application
import android.content.pm.PackageManager
import com.qcksys.ao3tracker.BuildConfig
import com.qcksys.ao3tracker.appBuildInfo
import com.qcksys.ao3tracker.buildConfiguration
import com.qcksys.ao3tracker.initializeAndroidAppConfiguration
import org.junit.Before
import org.json.JSONArray
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = Application::class)
class ApiEnvironmentBuildTest {
    @Before
    fun initializeBuildConfiguration() {
        initializeAndroidAppConfiguration(buildConfiguration())
    }

    @Test
    fun packagedBuildSuppliesItsVersionAndDefaultServer() {
        assertEquals(BuildConfig.VERSION_NAME, appBuildInfo().version)
        assertEquals(BuildConfig.VERSION_CODE.toString(), appBuildInfo().buildNumber)
        assertEquals(
            if (BuildConfig.BUILD_TYPE == "dev") ApiEnvironment.DEV else ApiEnvironment.PRODUCTION,
            defaultApiEnvironment()
        )
    }

    @Test
    fun releaseDisablesServerSelectionWhileDevelopmentBuildsAllowIt() {
        val settings = AppSettings(null)
        assertEquals(BuildConfig.BUILD_TYPE != "release", settings.canSelectApiEnvironment)
        settings.setDevModeEnabled(true)
        settings.setApiEnvironment(ApiEnvironment.LOCAL)
        assertEquals(
            if (BuildConfig.BUILD_TYPE == "release") ApiEnvironment.PRODUCTION else ApiEnvironment.LOCAL,
            settings.apiEnvironment.value
        )
    }

    @Test
    fun packagedManifestDeclaresCredentialAssociationForItsServers() {
        val context = RuntimeEnvironment.getApplication()
        val application = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        val resourceId = application.metaData.getInt("asset_statements")
        assertNotEquals(0, resourceId)
        val statements = JSONArray(context.getString(resourceId))
        val includes = (0 until statements.length()).map { statements.getJSONObject(it).getString("include") }
        assertEquals(
            if (BuildConfig.BUILD_TYPE == "release") listOf("https://ao3tracker.com/.well-known/assetlinks.json")
            else listOf(
                "https://dev.ao3tracker.com/.well-known/assetlinks.json",
                "https://qcksys-ao3tracker-api-local.ta2.dev/.well-known/assetlinks.json"
            ),
            includes
        )
    }
}
