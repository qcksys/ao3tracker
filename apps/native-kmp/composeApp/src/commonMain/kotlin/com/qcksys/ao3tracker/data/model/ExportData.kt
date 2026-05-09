package com.qcksys.ao3tracker.data.model

import kotlinx.serialization.Serializable

@Serializable
data class ExportData(
    val version: Int = 1,
    val exportedAt: String,
    val works: List<Work>
)
