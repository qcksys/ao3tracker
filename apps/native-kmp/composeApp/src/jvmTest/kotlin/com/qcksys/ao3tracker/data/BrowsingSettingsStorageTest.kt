package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.BrowsingPreferences
import com.qcksys.ao3tracker.data.settings.SettingsStorage
import java.util.prefs.Preferences
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import com.qcksys.ao3tracker.data.settings.BrowsingState
import com.qcksys.ao3tracker.util.JsonConfig
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class BrowsingSettingsStorageTest {
    @Test
    fun languagePreferenceSurvivesRestartAndDisablingPreservesSelection() {
        val storage = SettingsStorage()
        val previous = storage.getBrowsingPreferences()
        try {
            storage.setBrowsingPreferences("""{"hiddenWorkIds":[123],"hiddenTags":["Angst"]}""")
            val settings = AppSettings(storage)
            assertEquals(false, settings.browsingPreferences.value.languageFilterEnabled)
            assertEquals("en", settings.browsingPreferences.value.searchLanguage)
            settings.setSearchLanguage("ptBR", true)
            val restarted = AppSettings(SettingsStorage())
            assertEquals(BrowsingPreferences(listOf(123), listOf("Angst"), true, "ptBR"), restarted.browsingPreferences.value)
            restarted.setSearchLanguage("ptBR", false)
            assertEquals("ptBR", AppSettings(SettingsStorage()).browsingPreferences.value.searchLanguage)
            assertEquals(false, AppSettings(SettingsStorage()).browsingPreferences.value.languageFilterEnabled)
            assertFailsWith<IllegalArgumentException> { restarted.setSearchLanguage("invalid", true) }
        } finally {
            if (previous == null) Preferences.userNodeForPackage(SettingsStorage::class.java).remove("browsing_preferences")
            else storage.setBrowsingPreferences(previous)
        }
    }

    @Test
    fun bridgeAlwaysIncludesTheSelectedLanguageEvenWhenEnglish() {
        for (maxFandoms in listOf(null, 1, 3)) {
            val payload = JsonConfig.json.encodeToString(BrowsingState(emptyList(), emptyList(), emptyList(), true, "en", maxFandoms))
            val json = JsonConfig.json.parseToJsonElement(payload).jsonObject
            assertEquals("en", json.getValue("searchLanguage").jsonPrimitive.content)
            assertEquals("true", json.getValue("languageFilterEnabled").jsonPrimitive.content)
            assertEquals(maxFandoms, json["maxFandoms"]?.jsonPrimitive?.content?.toIntOrNull())
        }
    }

    @Test
    fun fandomLimitsPersistAndCanBeCleared() {
        val storage = SettingsStorage()
        val previous = storage.getBrowsingPreferences()
        try {
            storage.setBrowsingPreferences("""{"hiddenWorkIds":[123],"hiddenTags":["Angst"]}""")
            val settings = AppSettings(storage)
            assertEquals(null, settings.browsingPreferences.value.maxFandoms)
            settings.setMaxFandoms(3)
            settings.setSearchLanguage("fr", true)
            val restarted = AppSettings(SettingsStorage())
            assertEquals(BrowsingPreferences(listOf(123), listOf("Angst"), true, "fr", 3), restarted.browsingPreferences.value)
            assertFailsWith<IllegalArgumentException> { restarted.setMaxFandoms(0) }
            assertFailsWith<IllegalArgumentException> { restarted.setMaxFandoms(-1) }
            restarted.setMaxFandoms(1)
            assertEquals(1, AppSettings(SettingsStorage()).browsingPreferences.value.maxFandoms)
            restarted.setMaxFandoms(null)
            assertEquals(null, AppSettings(SettingsStorage()).browsingPreferences.value.maxFandoms)
        } finally {
            if (previous == null) Preferences.userNodeForPackage(SettingsStorage::class.java).remove("browsing_preferences")
            else storage.setBrowsingPreferences(previous)
        }
    }

    @Test
    fun hiddenWorksAndTagsPersistAndCanBeRemoved() {
        val storage = SettingsStorage()
        val previous = storage.getBrowsingPreferences()
        try {
            storage.setBrowsingPreferences("{}")
            val settings = AppSettings(storage)
            assertEquals(BrowsingPreferences(), settings.browsingPreferences.value)
            settings.setHiddenTags(" Angst \nFluff, angst, ")
            settings.setWorkHidden(123, true)
            settings.setWorkHidden(123, true)
            settings.setWorkHidden(-1, true)
            val restarted = AppSettings(SettingsStorage())
            assertEquals(BrowsingPreferences(listOf(123), listOf("Angst", "Fluff")), restarted.browsingPreferences.value)
            restarted.setWorkHidden(123, false)
            restarted.setHiddenTags("")
            assertEquals(BrowsingPreferences(), AppSettings(SettingsStorage()).browsingPreferences.value)
        } finally {
            if (previous == null) Preferences.userNodeForPackage(SettingsStorage::class.java).remove("browsing_preferences")
            else storage.setBrowsingPreferences(previous)
        }
    }
}
