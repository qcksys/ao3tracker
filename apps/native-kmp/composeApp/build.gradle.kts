import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import groovy.json.JsonSlurper
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.composeHotReload)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.room)
    alias(libs.plugins.googleServices)
    alias(libs.plugins.posthog)
}

// WebView Scripts build configuration
val webviewScriptsDir = rootProject.file("webview-scripts")
val webviewScriptsOutputDir = layout.buildDirectory.dir("generated/webview-scripts")
val generatedKotlinDir = layout.buildDirectory.dir("generated/kotlin/webview")
val generatedBuildInfoDir = layout.buildDirectory.dir("generated/kotlin/build-info")
val desktopVersion = "1.0.0"

val generateAppBuildInfo by tasks.registering {
    val version = desktopVersion
    val buildTimeOverride = providers.environmentVariable("APP_BUILD_TIME_UTC")
    inputs.property("desktopVersion", version)
    inputs.property("buildTimeOverride", buildTimeOverride.orElse(""))
    val outputFile = generatedBuildInfoDir.get().file("GeneratedAppBuildInfo.kt").asFile
    outputs.file(outputFile)
    // CI validation uses stable metadata; local and signed builds retain their actual time.
    outputs.upToDateWhen { buildTimeOverride.isPresent }
    doLast {
        val buildTimeUtc = buildTimeOverride.orNull ?: DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss 'UTC'")
            .withZone(ZoneOffset.UTC)
            .format(Instant.now())
        outputFile.parentFile.mkdirs()
        outputFile.writeText("""
            |package com.qcksys.ao3tracker
            |
            |internal object GeneratedAppBuildInfo {
            |    const val desktopVersion = "$version"
            |    const val buildTimeUtc = ${groovy.json.JsonOutput.toJson(buildTimeUtc).replace("$", "\\$")}
            |}
        """.trimMargin())
    }
}

val workspaceRoot = rootProject.file("../..")
val isWindows = System.getProperty("os.name").lowercase().contains("win")
val vpCommand = if (isWindows) listOf("cmd", "/c", "vp") else listOf("vp")


val generateAo3Languages by tasks.registering {
    val sourceFile = workspaceRoot.resolve("packages/ao3-core/src/languages.json")
    val outputFile = generatedKotlinDir.get().file("Ao3Languages.kt").asFile
    inputs.file(sourceFile)
    outputs.file(outputFile)
    doLast {
        val languages = JsonSlurper().parse(sourceFile) as List<*>
        fun literal(value: Any?): String = groovy.json.JsonOutput.toJson(value)
            .replace("$", "\\$")
        val entries = languages.joinToString(",\n") { entry ->
            val language = entry as Map<*, *>
            "        ${literal(language["code"])} to ${literal(language["label"])}"
        }
        outputFile.parentFile.mkdirs()
        outputFile.writeText("package com.qcksys.ao3tracker.data.settings\n\ninternal object Ao3Languages {\n    val options = listOf(\n$entries\n    )\n}\n")
    }
}

// Install at the workspace root to resolve the shared package links.
val vpInstall by tasks.registering(Exec::class) {
    workingDir = workspaceRoot
    commandLine = vpCommand + listOf("install", "--frozen-lockfile")
    inputs.file(workspaceRoot.resolve("pnpm-lock.yaml"))
    inputs.file(webviewScriptsDir.resolve("package.json"))
    outputs.dir(webviewScriptsDir.resolve("node_modules"))
}

val compileWebviewScripts by tasks.registering(Exec::class) {
    dependsOn(vpInstall)
    workingDir = webviewScriptsDir
    commandLine = vpCommand + listOf("run", "build")
    inputs.dir(webviewScriptsDir.resolve("src"))
    inputs.dir(workspaceRoot.resolve("packages/ao3-core/src"))
    inputs.file(workspaceRoot.resolve("packages/ao3-core/package.json"))
    inputs.file(workspaceRoot.resolve("pnpm-lock.yaml"))
    inputs.file(webviewScriptsDir.resolve("tsconfig.json"))
    inputs.file(webviewScriptsDir.resolve("package.json"))
    inputs.file(webviewScriptsDir.resolve("vite.config.ts"))
    inputs.file(webviewScriptsDir.resolve("build.ts"))
    outputs.dir(webviewScriptsDir.resolve("dist"))
}

// Task to generate Kotlin source files from compiled JS
val generateWebviewScriptKotlin by tasks.registering {
    dependsOn(compileWebviewScripts)

    val trackingJsFile = webviewScriptsDir.resolve("dist/ao3-tracking.min.js")
    val searchCheckJsFile = webviewScriptsDir.resolve("dist/search-check.min.js")
    val scrollRestoreJsFile = webviewScriptsDir.resolve("dist/scroll-restore.min.js")
    val offlineCaptureJsFile = webviewScriptsDir.resolve("dist/offline-capture.min.js")
    val offlineCaptureOutputFile = generatedKotlinDir.get().file("OfflineCaptureScriptGenerated.kt").asFile
    val offlineReaderJsFile = webviewScriptsDir.resolve("dist/offline-reader.min.js")
    val offlineReaderOutputFile = generatedKotlinDir.get().file("OfflineReaderScriptGenerated.kt").asFile
    val offlineObservationJsFile = webviewScriptsDir.resolve("dist/offline-observation.min.js")
    val offlineObservationOutputFile = generatedKotlinDir.get().file("OfflineObservationScriptGenerated.kt").asFile
    val trackingOutputFile = generatedKotlinDir.get().file("Ao3TrackingScriptGenerated.kt").asFile
    val scrollRestoreOutputFile = generatedKotlinDir.get().file("ScrollRestoreScriptGenerated.kt").asFile

    inputs.file(trackingJsFile)
    inputs.file(searchCheckJsFile)
    inputs.file(scrollRestoreJsFile)
    inputs.file(offlineCaptureJsFile)
    outputs.file(offlineCaptureOutputFile)
    inputs.file(offlineReaderJsFile)
    outputs.file(offlineReaderOutputFile)
    inputs.file(offlineObservationJsFile)
    outputs.file(offlineObservationOutputFile)
    outputs.file(trackingOutputFile)
    val searchCheckOutputFile = generatedKotlinDir.get().file("SearchCheckScriptGenerated.kt").asFile
    outputs.file(searchCheckOutputFile)
    outputs.file(scrollRestoreOutputFile)

    doLast {
        // Generate tracking script
        val trackingJsContent = trackingJsFile.readText()
        val escapedTrackingJs = trackingJsContent.replace("$", "\${'$'}")

        val trackingKotlinContent = """
            |// AUTO-GENERATED FILE - DO NOT EDIT
            |// Generated from webview-scripts/src/ao3-tracking.ts
            |package com.qcksys.ao3tracker.webview
            |
            |object Ao3TrackingScriptGenerated {
            |    val script: String = ${"\"\"\""}
            |$escapedTrackingJs
            |${"\"\"\""}
            |}
        """.trimMargin()

        trackingOutputFile.parentFile.mkdirs()
        trackingOutputFile.writeText(trackingKotlinContent)

        // Keep each literal below the JVM's 64 KiB constant limit.
        val offlineChunks = offlineCaptureJsFile.readText().chunked(16_000).joinToString(",\n") {
            "        " + groovy.json.JsonOutput.toJson(it).replace("$", "\\$")
        }
        offlineCaptureOutputFile.writeText("""
            |package com.qcksys.ao3tracker.webview
            |
            |object OfflineCaptureScriptGenerated {
            |    val script: String = listOf(
            |$offlineChunks
            |    ).joinToString("")
            |}
        """.trimMargin())

        val offlineObservationLiteral = groovy.json.JsonOutput.toJson(offlineObservationJsFile.readText()).replace("$", "\\$")
        offlineObservationOutputFile.writeText("""
            |package com.qcksys.ao3tracker.webview
            |
            |object OfflineObservationScriptGenerated {
            |    val script: String = $offlineObservationLiteral
            |}
        """.trimMargin())

        val offlineReaderLiteral = groovy.json.JsonOutput.toJson(offlineReaderJsFile.readText()).replace("$", "\\$")
        offlineReaderOutputFile.writeText("""
            |package com.qcksys.ao3tracker.webview
            |
            |object OfflineReaderScriptGenerated {
            |    val script: String = $offlineReaderLiteral
            |}
        """.trimMargin())

        val searchCheckContent = searchCheckJsFile.readText().replace("$", "\${'$'}")
        searchCheckOutputFile.writeText("""
            |package com.qcksys.ao3tracker.webview
            |
            |object SearchCheckScriptGenerated {
            |    val script: String = ${"\"\"\""}
            |$searchCheckContent
            |${"\"\"\""}
            |}
        """.trimMargin())

        // Generate scroll restore script
        val scrollRestoreJsContent = scrollRestoreJsFile.readText()
        val escapedScrollRestoreJs = scrollRestoreJsContent.replace("$", "\${'$'}")

        val scrollRestoreKotlinContent = """
            |// AUTO-GENERATED FILE - DO NOT EDIT
            |// Generated from webview-scripts/src/scroll-restore.ts
            |package com.qcksys.ao3tracker.webview
            |
            |object ScrollRestoreScriptGenerated {
            |    /**
            |     * Script that reads scrollTo param from URL, scrolls to that position,
            |     * and clears the param from URL.
            |     */
            |    val script: String = ${"\"\"\""}
            |$escapedScrollRestoreJs
            |${"\"\"\""}
            |}
        """.trimMargin()

        scrollRestoreOutputFile.writeText(scrollRestoreKotlinContent)
    }
}

// Make Kotlin compilation and KSP depend on generated sources
tasks.matching {
    it.name.startsWith("compileKotlin") ||
    it.name.contains("Kotlin") && it.name.contains("compile", ignoreCase = true) ||
    it.name.startsWith("ksp")
}.configureEach {
    dependsOn(generateWebviewScriptKotlin)
    dependsOn(generateAppBuildInfo)
    dependsOn(generateAo3Languages)
}

kotlin {
    compilerOptions {
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }

    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_11)
        }
    }

    listOf(
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "ComposeApp"
            isStatic = true
        }
    }

    jvm()

    sourceSets {
        androidMain { kotlin.srcDir("src/jvmSharedMain/kotlin") }
        jvmMain { kotlin.srcDir("src/jvmSharedMain/kotlin") }
        commonMain {
            kotlin.srcDir(generatedKotlinDir)
            kotlin.srcDir(generatedBuildInfoDir)
        }
        androidMain.dependencies {
            implementation(compose.preview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.androidx.webkit)
            implementation(libs.koin.android)
            implementation(libs.ktor.client.okhttp)
            implementation(libs.credentials)
            implementation(libs.credentials.play.services)
            implementation(libs.security.crypto)
            implementation(libs.firebase.messaging)
        }
        commonMain.dependencies {
            implementation(libs.posthog.kmp)
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
            implementation(compose.components.resources)
            implementation(compose.components.uiToolingPreview)
            implementation(libs.androidx.lifecycle.viewmodelCompose)
            implementation(libs.androidx.lifecycle.runtimeCompose)

            // Kotlinx
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)

            // Room
            implementation(libs.room.runtime)
            implementation(libs.sqlite.bundled)

            // Koin DI
            implementation(libs.koin.core)
            implementation(libs.koin.compose)
            implementation(libs.koin.compose.viewmodel)

            // Voyager Navigation
            implementation(libs.voyager.navigator)
            implementation(libs.voyager.screenModel)
            implementation(libs.voyager.tabNavigator)
            implementation(libs.voyager.transitions)
            implementation(libs.voyager.koin)

            // Coil Image Loading
            implementation(libs.coil.compose)

            // Material Icons Extended
            implementation(compose.materialIconsExtended)

            // Ktor HTTP Client
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.kotlinx.json)

            // Logging
            implementation(libs.napier)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.turbine)
        }
        androidUnitTest.dependencies {
            implementation(libs.robolectric)
        }
        androidInstrumentedTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.androidx.testExt.junit)
            implementation(libs.androidx.espresso.core)
        }
        jvmMain.dependencies {
            implementation(compose.desktop.currentOs)
            implementation(libs.kotlinx.coroutinesSwing)
            implementation(libs.ktor.client.java)
        }
        jvmTest.dependencies {
            implementation(compose.desktop.uiTestJUnit4)
        }
    }
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

dependencies {
    debugImplementation(compose.uiTooling)
    add("kspAndroid", libs.room.compiler)
    add("kspIosArm64", libs.room.compiler)
    add("kspIosSimulatorArm64", libs.room.compiler)
    add("kspJvm", libs.room.compiler)
}

compose.desktop {
    application {
        mainClass = "com.qcksys.ao3tracker.MainKt"

        buildTypes.release.proguard {
            configurationFiles.from(project.file("compose-desktop.pro"))
        }

        nativeDistributions {
            modules("jdk.unsupported")
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "com.qcksys.ao3tracker"
            packageVersion = desktopVersion
            macOS { iconFile.set(project.file("icons/app.icns")) }
            windows { iconFile.set(project.file("icons/app.ico")) }
            linux { iconFile.set(project.file("icons/app.png")) }
        }
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}

tasks.withType<com.posthog.android.PostHogCliExecTask>().configureEach {
    // Local and PR builds still embed mapping IDs, but only release jobs upload symbols.
    onlyIf { providers.environmentVariable("POSTHOG_CLI_API_KEY").isPresent }
}
