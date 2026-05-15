import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.composeHotReload)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.room)
    alias(libs.plugins.sentryKmp)
    alias(libs.plugins.googleServices)
}

// WebView Scripts build configuration
val webviewScriptsDir = rootProject.file("webview-scripts")
val webviewScriptsOutputDir = layout.buildDirectory.dir("generated/webview-scripts")
val generatedKotlinDir = layout.buildDirectory.dir("generated/kotlin/webview")

// pnpm workspace root for installing webview-script dependencies
val workspaceRoot = rootProject.file("../..")
val isWindows = System.getProperty("os.name").lowercase().contains("win")
val pnpmCommand = if (isWindows) listOf("cmd", "/c", "pnpm") else listOf("pnpm")

// Task to install workspace dependencies with pnpm (root install resolves
// workspace links for @qcksys/ao3tracker-core).
val pnpmInstall by tasks.registering(Exec::class) {
    workingDir = workspaceRoot
    commandLine = pnpmCommand + listOf("install", "--frozen-lockfile=false")
    inputs.file(workspaceRoot.resolve("pnpm-lock.yaml"))
    inputs.file(webviewScriptsDir.resolve("package.json"))
    outputs.dir(webviewScriptsDir.resolve("node_modules"))
}

// Task to compile TypeScript via pnpm script
val compileWebviewScripts by tasks.registering(Exec::class) {
    dependsOn(pnpmInstall)
    workingDir = webviewScriptsDir
    commandLine = pnpmCommand + listOf("run", "build")
    inputs.dir(webviewScriptsDir.resolve("src"))
    inputs.file(webviewScriptsDir.resolve("tsconfig.json"))
    inputs.file(webviewScriptsDir.resolve("build.ts"))
    outputs.dir(webviewScriptsDir.resolve("dist"))
}

// Task to generate Kotlin source files from compiled JS
val generateWebviewScriptKotlin by tasks.registering {
    dependsOn(compileWebviewScripts)

    val trackingJsFile = webviewScriptsDir.resolve("dist/ao3-tracking.min.js")
    val scrollRestoreJsFile = webviewScriptsDir.resolve("dist/scroll-restore.min.js")
    val trackingOutputFile = generatedKotlinDir.get().file("Ao3TrackingScriptGenerated.kt").asFile
    val scrollRestoreOutputFile = generatedKotlinDir.get().file("ScrollRestoreScriptGenerated.kt").asFile

    inputs.file(trackingJsFile)
    inputs.file(scrollRestoreJsFile)
    outputs.file(trackingOutputFile)
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
}

kotlin {
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
        commonMain {
            kotlin.srcDir(generatedKotlinDir)
        }
        androidMain.dependencies {
            implementation(compose.preview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.koin.android)
            implementation(libs.ktor.client.okhttp)
            implementation(libs.credentials)
            implementation(libs.credentials.play.services)
            implementation(libs.security.crypto)
            implementation(libs.firebase.messaging)
        }
        commonMain.dependencies {
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
        jvmMain.dependencies {
            implementation(compose.desktop.currentOs)
            implementation(libs.kotlinx.coroutinesSwing)
            implementation(libs.ktor.client.java)
        }
    }
}

android {
    namespace = "com.qcksys.ao3tracker"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.qcksys.ao3tracker"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 20
        versionName = "0.1.0"

        // Default to production API endpoints
        buildConfigField("String", "AUTH_BASE_URL", "\"https://ao3tracker.com/auth\"")
        buildConfigField("String", "API_BASE_URL", "\"https://ao3tracker.com/api\"")
        // Sentry DSN
        buildConfigField("String", "SENTRY_DSN", "\"https://12e1b1b6f3402ab88188b7508dd5f65c@o4507101986291712.ingest.de.sentry.io/4510465375993936\"")
    }

    buildFeatures {
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
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
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    lint {
        // DAL (Digital Asset Links) requires server-side assetlinks.json configuration.
        // Credential Manager works without it; DAL is primarily for cross-app/website credential sharing.
        disable += "CredManMissingDal"
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

        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "com.qcksys.ao3tracker"
            packageVersion = "1.0.0"
        }
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}
