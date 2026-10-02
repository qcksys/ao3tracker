package com.qcksys.ao3tracker.data

import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.SettingsStorage
import java.util.prefs.Preferences
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DiagnosticSettingsStorageTest {
    @Test
    fun defaultEnabledAndOptOutSurvivesRestart() {
        val prefs = Preferences.userNodeForPackage(SettingsStorage::class.java)
        val previous = prefs.get("diagnostic_data_enabled", null)
        try {
            prefs.remove("diagnostic_data_enabled")
            assertTrue(SettingsStorage().isDiagnosticDataEnabled())
            AppSettings(SettingsStorage()).setDiagnosticDataEnabled(false)
            val restarted = AppSettings(SettingsStorage())
            assertFalse(restarted.diagnosticDataEnabled.value)
            assertNull(restarted.captureDiagnosticSession())
        } finally {
            if (previous == null) prefs.remove("diagnostic_data_enabled") else prefs.put("diagnostic_data_enabled", previous)
        }
    }
}
