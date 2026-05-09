package com.qcksys.ao3tracker.data.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FilterStateTest {

    @Test
    fun `empty filter state has no active filters`() {
        val filterState = FilterState()
        assertFalse(filterState.hasActiveFilters)
        assertFalse(filterState.hasActiveTagFilters)
        assertFalse(filterState.hasActiveReadingStatusFilters)
    }

    @Test
    fun `search query activates hasActiveFilters but not hasActiveTagFilters`() {
        val filterState = FilterState(searchQuery = "test")
        assertTrue(filterState.hasActiveFilters)
        assertFalse(filterState.hasActiveTagFilters)
    }

    @Test
    fun `rating filter with INCLUDE activates both hasActiveFilters and hasActiveTagFilters`() {
        val filterState = FilterState(ratingFilters = mapOf("Explicit" to TagFilterMode.INCLUDE))
        assertTrue(filterState.hasActiveFilters)
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `rating filter with EXCLUDE activates tag filters`() {
        val filterState = FilterState(ratingFilters = mapOf("Explicit" to TagFilterMode.EXCLUDE))
        assertTrue(filterState.hasActiveFilters)
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `rating filter with DEFAULT does not activate tag filters`() {
        val filterState = FilterState(ratingFilters = mapOf("Explicit" to TagFilterMode.DEFAULT))
        assertFalse(filterState.hasActiveFilters)
        assertFalse(filterState.hasActiveTagFilters)
    }

    @Test
    fun `warning filter activates tag filters`() {
        val filterState = FilterState(warningFilters = mapOf("Major Character Death" to TagFilterMode.INCLUDE))
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `category filter activates tag filters`() {
        val filterState = FilterState(categoryFilters = mapOf("M/M" to TagFilterMode.INCLUDE))
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `fandom filter activates tag filters`() {
        val filterState = FilterState(fandomFilters = mapOf("Harry Potter" to TagFilterMode.INCLUDE))
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `relationship filter activates tag filters`() {
        val filterState = FilterState(relationshipFilters = mapOf("A/B" to TagFilterMode.INCLUDE))
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `character filter activates tag filters`() {
        val filterState = FilterState(characterFilters = mapOf("Character A" to TagFilterMode.INCLUDE))
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `freeform tag filter activates tag filters`() {
        val filterState = FilterState(freeformFilters = mapOf("Angst" to TagFilterMode.INCLUDE))
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `reading status filter activates hasActiveFilters`() {
        val filterState = FilterState(readingStatusFilters = mapOf(ReadingStatus.NOT_STARTED to TagFilterMode.INCLUDE))
        assertTrue(filterState.hasActiveFilters)
        assertTrue(filterState.hasActiveReadingStatusFilters)
        assertFalse(filterState.hasActiveTagFilters)
    }

    @Test
    fun `clearAll returns empty filter state`() {
        val filterState = FilterState(
            searchQuery = "test",
            ratingFilters = mapOf("Explicit" to TagFilterMode.INCLUDE),
            fandomFilters = mapOf("Fandom" to TagFilterMode.EXCLUDE),
            readingStatusFilters = mapOf(ReadingStatus.FINISHED to TagFilterMode.INCLUDE)
        )
        val cleared = filterState.clearAll()
        assertEquals(FilterState(), cleared)
    }

    @Test
    fun `combined search and tag filters both activate hasActiveFilters`() {
        val filterState = FilterState(
            searchQuery = "test",
            ratingFilters = mapOf("Teen And Up" to TagFilterMode.INCLUDE)
        )
        assertTrue(filterState.hasActiveFilters)
        assertTrue(filterState.hasActiveTagFilters)
    }

    @Test
    fun `getIncludedTags returns only INCLUDE mode tags`() {
        val filters = mapOf(
            "Tag1" to TagFilterMode.INCLUDE,
            "Tag2" to TagFilterMode.EXCLUDE,
            "Tag3" to TagFilterMode.DEFAULT,
            "Tag4" to TagFilterMode.INCLUDE
        )
        val filterState = FilterState()
        val included = filterState.getIncludedTags(filters)
        assertEquals(setOf("Tag1", "Tag4"), included)
    }

    @Test
    fun `getExcludedTags returns only EXCLUDE mode tags`() {
        val filters = mapOf(
            "Tag1" to TagFilterMode.INCLUDE,
            "Tag2" to TagFilterMode.EXCLUDE,
            "Tag3" to TagFilterMode.DEFAULT,
            "Tag4" to TagFilterMode.EXCLUDE
        )
        val filterState = FilterState()
        val excluded = filterState.getExcludedTags(filters)
        assertEquals(setOf("Tag2", "Tag4"), excluded)
    }

    @Test
    fun `getIncludedReadingStatuses returns only INCLUDE mode statuses`() {
        val filterState = FilterState(
            readingStatusFilters = mapOf(
                ReadingStatus.NOT_STARTED to TagFilterMode.INCLUDE,
                ReadingStatus.FINISHED to TagFilterMode.EXCLUDE,
                ReadingStatus.IN_PROGRESS to TagFilterMode.DEFAULT
            )
        )
        val included = filterState.getIncludedReadingStatuses()
        assertEquals(setOf(ReadingStatus.NOT_STARTED), included)
    }

    @Test
    fun `getExcludedReadingStatuses returns only EXCLUDE mode statuses`() {
        val filterState = FilterState(
            readingStatusFilters = mapOf(
                ReadingStatus.NOT_STARTED to TagFilterMode.INCLUDE,
                ReadingStatus.FINISHED to TagFilterMode.EXCLUDE,
                ReadingStatus.HAS_NEW_CHAPTERS to TagFilterMode.EXCLUDE
            )
        )
        val excluded = filterState.getExcludedReadingStatuses()
        assertEquals(setOf(ReadingStatus.FINISHED, ReadingStatus.HAS_NEW_CHAPTERS), excluded)
    }
}
