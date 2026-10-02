package com.qcksys.ao3tracker.diagnostics

import com.posthog.kmp.PostHog
import com.posthog.kmp.PostHogContext
import com.qcksys.ao3tracker.appBuildInfo
import com.qcksys.ao3tracker.data.settings.DiagnosticSession
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.jar.Attributes
import java.util.jar.JarOutputStream
import java.util.jar.Manifest
import java.util.zip.GZIPInputStream
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.system.exitProcess
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PostHogPersistenceTest {
    @Test
    fun fatalCrashSurvivesFailedDeliveryAndProcessRestarts() = withProbe { probe ->
        probe.configOnline.set(false)
        probe.crash()
        val offline = probe.start("restart")
        assertNotNull(probe.attempts.poll(20, TimeUnit.SECONDS), probe.logs())
        offline.destroyForcibly().waitFor(5, TimeUnit.SECONDS)
        probe.online.set(true)
        probe.start("restart")
        val batch = assertNotNull(probe.delivered.poll(20, TimeUnit.SECONDS), probe.logs())
        val event = Json.parseToJsonElement(batch).jsonObject["batch"]!!.jsonArray.first().jsonObject
        assertEquals("\$exception", event["event"]!!.jsonPrimitive.content)
        val properties = event["properties"]!!.jsonObject
        assertEquals("fatal", properties["\$exception_level"]!!.jsonPrimitive.content)
        assertEquals(appBuildInfo().version, properties["\$app_version"]!!.jsonPrimitive.content)
        assertTrue(properties["\$exception_list"].toString().contains("Persisted crash probe"))
        assertTrue(probe.paths.all { it.startsWith("/ingest/native/") }, "SDK bypassed proxy: " + probe.paths)
    }

    @Test
    fun disabledStartupMakesNoRequestsAndOptInResumesCapture() = withProbe { probe ->
        probe.online.set(true)
        probe.start("consent")
        val batch = assertNotNull(probe.delivered.poll(20, TimeUnit.SECONDS), probe.logs())
        assertTrue(batch.contains("Opted back in"), "Expected only a new opted-in report: $batch")
        assertTrue(!batch.contains("Must not capture"), "Opt-out allowed a new report")
        assertTrue(probe.logs().contains("Disabled without SDK"), probe.logs())
    }

    private fun withProbe(test: (Probe) -> Unit) {
        val probe = Probe()
        try {
            test(probe)
        } finally {
            probe.close()
        }
    }

    private class Probe : AutoCloseable {
        val directory = Files.createTempDirectory("posthog-crash-test").toFile()
        val online = AtomicBoolean(false)
        val configOnline = AtomicBoolean(true)
        val delivered = LinkedBlockingQueue<String>()
        val attempts = LinkedBlockingQueue<String>()
        val paths = CopyOnWriteArrayList<String>()
        private val processes = mutableListOf<Process>()
        private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/") { exchange ->
                paths.add(exchange.requestURI.path)
                if (exchange.requestMethod == "POST") {
                    val stream = if (exchange.requestHeaders.getFirst("Content-Encoding") == "gzip")
                        GZIPInputStream(exchange.requestBody) else exchange.requestBody
                    val body = stream.bufferedReader().use { it.readText() }
                    val accepted = online.get()
                    exchange.sendResponseHeaders(if (accepted) 200 else 503, -1)
                    if (accepted) delivered.add(body)
                    attempts.add(body)
                } else if (!configOnline.get()) {
                    exchange.sendResponseHeaders(503, -1)
                } else {
                    val config = """{"errorTracking":{"autocaptureExceptions":true},"sessionRecording":false}""".toByteArray()
                    exchange.responseHeaders.add("Content-Type", "application/json")
                    exchange.sendResponseHeaders(200, config.size.toLong())
                    exchange.responseBody.use { it.write(config) }
                }
                exchange.close()
            }
            start()
        }

        fun crash() {
            val process = start("crash")
            assertTrue(process.waitFor(30, TimeUnit.SECONDS), "Crash probe timed out")
            assertEquals(23, process.exitValue(), logs())
        }

        fun start(mode: String): Process {
            val classpath = File(directory, "classpath.jar")
            val manifest = Manifest().apply {
                mainAttributes[Attributes.Name.MANIFEST_VERSION] = "1.0"
                mainAttributes[Attributes.Name.CLASS_PATH] = System.getProperty("java.class.path")
                    .split(File.pathSeparator).joinToString(" ") { File(it).toURI().toString() }
            }
            JarOutputStream(classpath.outputStream(), manifest).close()
            val java = File(System.getProperty("java.home"), "bin/java").path
            return ProcessBuilder(java, "-Duser.home=" + directory.path, "-cp", classpath.path,
                PostHogPersistenceProbe::class.java.name, "http://127.0.0.1:" + server.address.port, mode)
                .redirectErrorStream(true)
                .redirectOutput(File(directory, processes.size.toString() + ".log"))
                .start().also { processes.add(it) }
        }

        fun logs() = "Paths: $paths. Logs: " +
            directory.listFiles()!!.filter { it.extension == "log" }.joinToString { it.readText() }

        override fun close() {
            processes.forEach { it.destroyForcibly().waitFor(5, TimeUnit.SECONDS) }
            server.stop(0)
            directory.deleteRecursively()
        }
    }
}

object PostHogPersistenceProbe {
    @JvmStatic
    fun main(args: Array<String>) {
        Thread.setDefaultUncaughtExceptionHandler { _, _ -> exitProcess(23) }
        val session = DiagnosticSession(0, args[1] != "consent", args[0] + "/api")
        PostHogCrashReporter.initialize(PostHogContext(), session)
        if (args[1] == "crash") {
            repeat(100) {
                if (Thread.getDefaultUncaughtExceptionHandler()?.javaClass?.name?.startsWith("com.posthog.") == true) {
                    throw IllegalStateException("Persisted crash probe")
                }
                Thread.sleep(50)
            }
            exitProcess(24)
        }
        if (args[1] == "consent") {
            PostHogCrashReporter.captureException(IllegalStateException("Must not capture while opted out"))
            check(Thread.getDefaultUncaughtExceptionHandler()?.javaClass?.name?.startsWith("com.posthog.") != true)
            println("Disabled without SDK")
            Thread.sleep(500)
            PostHogCrashReporter.configure(session.copy(generation = 1, enabled = true))
            PostHogCrashReporter.configure(session.copy(generation = 2, enabled = false))
            PostHogCrashReporter.captureException(IllegalStateException("Must not capture after opt-out"))
            PostHogCrashReporter.configure(session.copy(generation = 3, enabled = true))
            PostHogCrashReporter.captureException(IllegalStateException("Opted back in"))
        }
        repeat(100) {
            PostHog.flush()
            Thread.sleep(250)
        }
        PostHog.close()
    }
}
