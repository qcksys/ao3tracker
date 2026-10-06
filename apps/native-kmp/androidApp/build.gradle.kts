import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.googleServices)
    alias(libs.plugins.posthog)
}

val releaseVersionCode = providers.environmentVariable("ANDROID_VERSION_CODE").orNull?.let { value ->
    require(value.matches(Regex("[1-9][0-9]{0,9}"))) {
        "ANDROID_VERSION_CODE must be an integer between 1 and 2100000000"
    }
    val code = value.toLong()
    require(code <= 2_100_000_000L) { "ANDROID_VERSION_CODE must not exceed 2100000000" }
    code.toInt()
} ?: 20

val releaseVersionName = providers.environmentVariable("ANDROID_VERSION_NAME").orNull?.also { value ->
    require(value.length <= 128 && value.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?"))) {
        "ANDROID_VERSION_NAME must be a version such as 1.2.3 or 1.2.3-rc.1 (maximum 128 characters)"
    }
} ?: "0.1.0"

val releaseSigning = listOf(
    "ANDROID_KEYSTORE_PATH",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD"
).associateWith { providers.environmentVariable(it).orNull }
val hasReleaseSigning = releaseSigning.values.any { it != null }
require(!hasReleaseSigning || releaseSigning.values.all { !it.isNullOrBlank() }) {
    "Release signing requires ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD together"
}
val releaseKeystore = releaseSigning["ANDROID_KEYSTORE_PATH"]?.let(rootProject::file)
require(releaseKeystore == null || releaseKeystore.isFile) { "ANDROID_KEYSTORE_PATH must name an existing keystore file" }

android {
    namespace = "com.qcksys.ao3tracker"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.qcksys.ao3tracker"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = releaseVersionCode
        versionName = releaseVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("boolean", "API_ENVIRONMENT_SELECTION_ENABLED", "false")
        buildConfigField("String", "API_ENVIRONMENT", "\"PRODUCTION\"")
        buildConfigField("String", "AUTH_BASE_URL", "\"https://ao3tracker.com/auth\"")
        buildConfigField("String", "API_BASE_URL", "\"https://ao3tracker.com/api\"")
    }

    buildFeatures {
        buildConfig = true
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
    lint {
        checkDependencies = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    if (hasReleaseSigning) {
        signingConfigs.create("release") {
            storeFile = releaseKeystore
            storePassword = releaseSigning.getValue("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = releaseSigning.getValue("ANDROID_KEY_ALIAS")
            keyPassword = releaseSigning.getValue("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        getByName("debug") {
            buildConfigField("boolean", "API_ENVIRONMENT_SELECTION_ENABLED", "true")
        }
        getByName("release") {
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            ndk {
                debugSymbolLevel = "FULL"
            }
        }
        create("dev") {
            initWith(getByName("release"))
            applicationIdSuffix = ".dev"
            matchingFallbacks += "release"
            buildConfigField("boolean", "API_ENVIRONMENT_SELECTION_ENABLED", "true")
            buildConfigField("String", "API_ENVIRONMENT", "\"DEV\"")
            buildConfigField("String", "AUTH_BASE_URL", "\"https://dev.ao3tracker.com/auth\"")
            buildConfigField("String", "API_BASE_URL", "\"https://dev.ao3tracker.com/api\"")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_11) }
}

dependencies {
    implementation(projects.composeApp)
    implementation(libs.androidx.core.ktx)
    debugImplementation(libs.compose.uiTooling)
    testImplementation(libs.kotlin.testJunit)
    testImplementation(libs.robolectric)
    testImplementation(libs.kotlinx.coroutines.core)
    androidTestImplementation(libs.kotlin.testJunit)
    androidTestImplementation(libs.androidx.testExt.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.activity.compose)
}

tasks.withType<com.posthog.android.PostHogCliExecTask>().configureEach {
    // Local and PR builds still embed mapping IDs, but only release jobs upload symbols.
    onlyIf { providers.environmentVariable("POSTHOG_CLI_API_KEY").isPresent }
}
