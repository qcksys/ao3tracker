package com.qcksys.ao3tracker.ui.screens.searches

import kotlin.test.Test
import kotlin.test.assertEquals

class SavedSearchTagsTest {
    @Test
    fun decodesTagsDeduplicatesAndIgnoresNonTagFilters() {
        val url = "https://archiveofourown.org/tags/Alice*s*Bob/works?" +
            "work_search[other_tag_names]=Fluff%2C+Caf%C3%A9%2C+%2C+Fluff" +
            "&work_search[relationship_names]=Alice%2FBob" +
            "&work_search[excluded_tag_names]=Angst%2C+Major+Character+Death" +
            "&work_search[query]=not+a+tag&work_search[language_id]=en&work_search[words_from]=1000&page=2"
        assertEquals(listOf("Alice/Bob", "Fluff", "Café", "Exclude: Angst", "Exclude: Major Character Death"), savedSearchTags(url))
    }

    @Test
    fun includesBookmarkTagsAndLabelsNumericIds() {
        val url = "https://archiveofourown.org/bookmarks?tag_id=Fandom*a*Friends" +
            "&include_bookmark_search[fandom_ids][]=123&include_bookmark_search[fandom_ids][]=456" +
            "&exclude_bookmark_search[relationship_ids][]=789" +
            "&bookmark_search[other_bookmark_tag_names]=Favourites%2C+Read+again" +
            "&bookmark_search[excluded_bookmark_tag_names]=Spoilers" +
            "&bookmark_search[tag_ids][]=42&bookmark_search[excluded_bookmark_tag_ids][]=99"
        assertEquals(listOf("Fandom&Friends", "Fandom #123", "Fandom #456", "Exclude: Relationship #789",
            "Favourites", "Read again", "Exclude: Spoilers", "Tag #42", "Exclude: Bookmark tag #99"), savedSearchTags(url))
    }

    @Test
    fun keepsIncludedAndExcludedTagsDistinctAndNumericNamesIntact() {
        assertEquals(listOf("1984", "Fluff", "Exclude: Fluff"), savedSearchTags(
            "https://archiveofourown.org/works?work_search[tag_names]=1984,Fluff&work_search[excluded_tag_names]=Fluff"
        ))
    }

    @Test
    fun handlesEmptySearchesAndMalformedPaths() {
        assertEquals(emptyList(), savedSearchTags("https://archiveofourown.org/works?work_search[query]=hello"))
        assertEquals(emptyList(), savedSearchTags("not a URL"))
        listOf("%ZZ", "%", "%2", "%2Z").forEach {
            assertEquals(emptyList(), savedSearchTags("https://archiveofourown.org/tags/$it/works?work_search[tag_names]=Fluff"))
        }
        assertEquals(listOf("%ZZ"), savedSearchTags("https://archiveofourown.org/tags/%25ZZ/works"))
    }
}
