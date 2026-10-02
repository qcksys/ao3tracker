package com.qcksys.ao3tracker.diagnostics

import com.posthog.kmp.ErrorTrackingConfig
import com.posthog.kmp.PersonProfiles
import com.posthog.kmp.PostHog
import com.posthog.kmp.PostHogBeforeSend
import com.posthog.kmp.PostHogConfig
import com.posthog.kmp.PostHogContext
import com.posthog.kmp.PostHogEvent
import com.qcksys.ao3tracker.AppBuildInfo
import com.qcksys.ao3tracker.appBuildInfo
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.DiagnosticSession
import com.qcksys.ao3tracker.data.settings.getSettingsStorage
import kotlinx.coroutines.flow.MutableStateFlow

object PostHogCrashReporter {
    private var context: PostHogContext? = null
    private val session = MutableStateFlow<DiagnosticSession?>(null)

    fun initialize(context: PostHogContext) =
        initialize(context, AppSettings(getSettingsStorage()).diagnosticSession.value)

    internal fun initialize(context: PostHogContext, initialSession: DiagnosticSession) {
        if (this.context != null) return
        this.context = context
        configure(initialSession)
    }

    fun configure(next: DiagnosticSession) {
        val sdkContext = context ?: return
        val previous = session.value
        if (previous?.enabled == next.enabled && previous.apiBaseUrl == next.apiBaseUrl) return
        session.value = next
        if (previous?.enabled == true) {
            PostHog.optOut()
            PostHog.close()
        }
        if (!next.enabled) return
        PostHog.setup(crashReportingConfig(next, appBuildInfo()) {
            session.value?.let { it.enabled && it.apiBaseUrl == next.apiBaseUrl } == true
        }, sdkContext)
        PostHog.optIn()
    }

    fun captureException(error: Throwable) {
        if (session.value?.enabled == true) PostHog.captureException(error)
    }
}

internal fun crashReportingConfig(
    session: DiagnosticSession,
    build: AppBuildInfo,
    canCapture: () -> Boolean
): PostHogConfig {
    val origin = session.apiBaseUrl.removeSuffix("/api")
    return PostHogConfig(
        // The proxy replaces this environment-specific queue namespace with its project token.
        apiKey = "ao3tracker-" + origin.substringAfter("://").replace(Regex("[^a-zA-Z0-9-]"), "-"),
        host = "$origin/ingest/native",
        captureApplicationLifecycleEvents = false,
        captureScreenViews = false,
        captureDeepLinks = false,
        sendFeatureFlagEvent = false,
        preloadFeatureFlags = false,
        personProfiles = PersonProfiles.NEVER,
        optOut = !session.enabled,
        flushAt = 1,
        maxBatchSize = 10,
        errorTracking = ErrorTrackingConfig(
            autoCapture = true,
            inAppIncludes = listOf("com.qcksys.ao3tracker")
        ),
        beforeSend = listOf(PostHogBeforeSend { event ->
            if (!canCapture() || event.event != "\$exception") null
            else filterCrashEvent(event, build)
        })
    )
}

internal fun filterCrashEvent(event: PostHogEvent, build: AppBuildInfo): PostHogEvent =
    event.copy(properties = event.properties.filterKeys { key ->
        key.startsWith("\$exception_") || key in setOf(
            "\$lib", "\$lib_version", "\$os", "\$os_version", "\$app_namespace",
            "\$device_manufacturer", "\$device_model", "\$device_type", "\$session_id"
        )
    } + mapOf(
        "\$app_version" to build.version,
        "\$app_build" to build.buildNumber,
        "app_build_time" to build.buildTimeUtc,
        "\$process_person_profile" to false,
        "\$geoip_disable" to true
    ))
