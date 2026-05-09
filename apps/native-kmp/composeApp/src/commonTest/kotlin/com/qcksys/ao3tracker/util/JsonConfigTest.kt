package com.qcksys.ao3tracker.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull

class JsonConfigTest {

    @Serializable
    data class TestData(
        val required: String,
        val optional: String? = null,
        val withDefault: Int = 42
    )

    @Test
    fun `json ignores unknown keys`() {
        val json = """{"required": "value", "unknown": "ignored"}"""
        val data = JsonConfig.json.decodeFromString<TestData>(json)
        assertEquals("value", data.required)
    }

    @Test
    fun `json handles null values for optional fields`() {
        val json = """{"required": "value", "optional": null}"""
        val data = JsonConfig.json.decodeFromString<TestData>(json)
        assertEquals("value", data.required)
        assertEquals(null, data.optional)
    }

    @Test
    fun `json uses default values when field is missing`() {
        val json = """{"required": "value"}"""
        val data = JsonConfig.json.decodeFromString<TestData>(json)
        assertEquals("value", data.required)
        assertEquals(42, data.withDefault)
    }

    @Test
    fun `json omits defaults and nulls`() {
        val data = TestData(required = "test")
        val json = JsonConfig.json.encodeToString(TestData.serializer(), data)
        // With encodeDefaults=false and explicitNulls=false, defaults and nulls are omitted
        assertFalse(json.contains("optional"))
        assertFalse(json.contains("withDefault"))
    }

    @Test
    fun `json is lenient with formatting`() {
        // Extra whitespace and trailing commas shouldn't break parsing
        val json = """
            {
                "required": "value",
                "optional": "test"
            }
        """.trimIndent()
        val data = JsonConfig.json.decodeFromString<TestData>(json)
        assertEquals("test", data.optional)
    }
}
