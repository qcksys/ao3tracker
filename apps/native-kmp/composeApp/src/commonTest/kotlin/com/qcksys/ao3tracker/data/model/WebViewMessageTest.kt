package com.qcksys.ao3tracker.data.model

import com.qcksys.ao3tracker.util.JsonConfig
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class WebViewMessageTest {

    @Test
    fun `WorkInfoEvent deserializes correctly`() {
        val json = """
            {
                "type": "workInfo",
                "url": "https://archiveofourown.org/works/12345",
                "workName": "Test Work",
                "authorName": "Test Author",
                "totalChapters": "5/10"
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<WorkInfoEvent>(json)

        assertEquals("workInfo", event.type)
        assertEquals("https://archiveofourown.org/works/12345", event.url)
        assertEquals("Test Work", event.workName)
        assertEquals("Test Author", event.authorName)
        assertEquals("5/10", event.totalChapters)
    }

    @Test
    fun `WorkTagsEvent deserializes correctly`() {
        val json = """
            {
                "type": "workTags",
                "url": "https://archiveofourown.org/works/12345",
                "rating": {"tag": "Teen And Up", "href": "/tags/Teen"},
                "fandom": [
                    {"tag": "Fandom A", "href": "/tags/FandomA"},
                    {"tag": "Fandom B", "href": "/tags/FandomB"}
                ],
                "warning": [],
                "category": [],
                "relationship": [],
                "character": [],
                "freeform": []
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<WorkTagsEvent>(json)

        assertEquals("workTags", event.type)
        assertEquals("Teen And Up", event.rating?.tag)
        assertEquals(2, event.fandom.size)
        assertEquals("Fandom A", event.fandom[0].tag)
    }

    @Test
    fun `ScrollProgressEvent deserializes correctly`() {
        val json = """
            {
                "type": "scrollProgress",
                "url": "https://archiveofourown.org/works/12345/chapters/67890",
                "scrollPercentage": 75
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<ScrollProgressEvent>(json)

        assertEquals("scrollProgress", event.type)
        assertEquals(75, event.scrollPercentage)
    }

    @Test
    fun `WorkChapterIndexEvent deserializes correctly`() {
        val json = """
            {
                "type": "workChapterIndex",
                "url": "https://archiveofourown.org/works/12345",
                "chapters": [
                    {"chapterNumber": "Chapter 1", "chapterUrl": "/works/12345/chapters/1"},
                    {"chapterNumber": "Chapter 2", "chapterUrl": "/works/12345/chapters/2"}
                ]
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<WorkChapterIndexEvent>(json)

        assertEquals("workChapterIndex", event.type)
        assertEquals(2, event.chapters.size)
        assertEquals("Chapter 1", event.chapters[0].chapterNumber)
    }

    @Test
    fun `message type extraction works`() {
        val json = """{"type": "workInfo", "url": "test"}"""
        val jsonElement = JsonConfig.json.parseToJsonElement(json)
        val type = jsonElement.jsonObject["type"]?.jsonPrimitive?.content

        assertEquals("workInfo", type)
    }

    @Test
    fun `unknown keys are ignored`() {
        val json = """
            {
                "type": "scrollProgress",
                "url": "https://example.com",
                "scrollPercentage": 50,
                "unknownField": "value",
                "anotherUnknown": 123
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<ScrollProgressEvent>(json)
        assertEquals(50, event.scrollPercentage)
    }

    @Test
    fun `optional fields can be null`() {
        val json = """
            {
                "type": "workInfo",
                "url": "https://archiveofourown.org/works/12345"
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<WorkInfoEvent>(json)

        assertEquals("https://archiveofourown.org/works/12345", event.url)
        assertNull(event.workName)
        assertNull(event.authorName)
        assertNull(event.totalChapters)
        assertNull(event.chapterId)
    }

    @Test
    fun `WorkInfoEvent with chapterId deserializes correctly`() {
        val json = """
            {
                "type": "workInfo",
                "url": "https://archiveofourown.org/works/12345",
                "workName": "Test Work",
                "chapterId": "67890",
                "chapterNumber": "chapter-1",
                "totalChapters": "3/10"
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<WorkInfoEvent>(json)

        assertEquals("workInfo", event.type)
        assertEquals("https://archiveofourown.org/works/12345", event.url)
        assertEquals("Test Work", event.workName)
        assertEquals("67890", event.chapterId)
        assertEquals("chapter-1", event.chapterNumber)
        assertEquals("3/10", event.totalChapters)
    }

    @Test
    fun `WorkInfoEvent with download fields deserializes correctly`() {
        val json = """
            {
                "type": "workInfo",
                "url": "https://archiveofourown.org/works/12345",
                "workName": "Test Work",
                "downloadPath": "/downloads/12345/Test_Work",
                "downloadUpdatedAt": "2024-11-11T22:39:43.000Z"
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<WorkInfoEvent>(json)

        assertEquals("workInfo", event.type)
        assertEquals("Test Work", event.workName)
        assertEquals("/downloads/12345/Test_Work", event.downloadPath)
        assertEquals("2024-11-11T22:39:43.000Z", event.downloadUpdatedAt)
    }

    @Test
    fun `WorkInfoEvent with isPrivate field deserializes correctly`() {
        val json = """
            {
                "type": "workInfo",
                "url": "https://archiveofourown.org/works/12345",
                "workName": "Restricted Work",
                "isPrivate": true
            }
        """.trimIndent()

        val event = JsonConfig.json.decodeFromString<WorkInfoEvent>(json)

        assertEquals("workInfo", event.type)
        assertEquals("Restricted Work", event.workName)
        assertEquals(true, event.isPrivate)
    }
}
