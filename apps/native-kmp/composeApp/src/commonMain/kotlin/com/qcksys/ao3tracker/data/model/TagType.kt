package com.qcksys.ao3tracker.data.model

enum class TagType(val id: Int, val displayName: String) {
    UNKNOWN(0, "Unknown"),
    RATING(1, "Rating"),
    WARNING(2, "Warning"),
    CATEGORY(3, "Category"),
    FANDOM(4, "Fandom"),
    RELATIONSHIP(5, "Relationship"),
    CHARACTER(6, "Character"),
    FREEFORM(7, "Additional Tags");

    companion object {
        fun fromId(id: Int): TagType {
            return entries.find { it.id == id } ?: UNKNOWN
        }

        fun fromString(value: String): TagType {
            return entries.find { it.name.equals(value, ignoreCase = true) } ?: UNKNOWN
        }
    }
}
