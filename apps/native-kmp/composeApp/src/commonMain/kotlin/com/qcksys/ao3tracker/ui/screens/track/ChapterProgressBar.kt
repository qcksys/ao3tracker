package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.progressSemantics
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.model.Work

internal fun Work.chapterProgressSegments(): List<Float> {
    val chapters = chapterList.filter { it.rowDeletedAt == null }
    val count = maxOf(currentChapters ?: 0, chapters.maxOfOrNull { it.number ?: 0 } ?: 0)
        .coerceAtLeast(chapters.size)
    val segments = MutableList(count) { 0f }
    chapters.forEach { chapter ->
        val number = chapter.number ?: if (count == 1) 1 else null
        if (number != null && number in 1..count) {
            segments[number - 1] = if (chapter.isComplete) 1f else (chapter.readProgress ?: 0f).coerceIn(0f, 1f)
        }
    }
    return segments
}

/** Unread track and read fill colours for a chapter segment, distinguishing downloaded chapters. */
internal fun ColorScheme.chapterSegmentColors(downloaded: Boolean): Pair<Color, Color> =
    if (downloaded) tertiaryContainer to tertiary else surfaceVariant to primary

/** [downloadedChapters] holds 1-based chapter numbers saved for offline reading. */
@Composable
internal fun ChapterProgressBar(work: Work, downloadedChapters: Set<Int> = emptySet()) {
    val segments = remember(work) { work.chapterProgressSegments() }
    val progress = if (segments.isEmpty()) 0f else segments.average().toFloat()
    val colors = MaterialTheme.colorScheme
    val downloadedCount = downloadedChapters.count { it in 1..segments.size }

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .progressSemantics(progress)
            .semantics {
                contentDescription = if (downloadedCount == 0) "Chapter reading progress"
                    else "Chapter reading progress · $downloadedCount downloaded"
            }
    ) {
        if (segments.isEmpty()) {
            drawRect(colors.surfaceVariant)
            return@Canvas
        }
        val slotWidth = size.width / segments.size
        val gap = minOf(2.dp.toPx(), slotWidth / 4f)
        val segmentWidth = (size.width - gap * (segments.size - 1)) / segments.size
        segments.forEachIndexed { index, fraction ->
            val left = if (layoutDirection == LayoutDirection.Rtl) {
                size.width - segmentWidth - index * (segmentWidth + gap)
            } else {
                index * (segmentWidth + gap)
            }
            val (trackColor, fillColor) = colors.chapterSegmentColors((index + 1) in downloadedChapters)
            drawRect(trackColor, Offset(left, 0f), Size(segmentWidth, size.height))
            if (fraction > 0f) {
                val fillLeft = if (layoutDirection == LayoutDirection.Rtl) left + segmentWidth * (1f - fraction) else left
                drawRect(fillColor, Offset(fillLeft, 0f), Size(segmentWidth * fraction, size.height))
            }
        }
    }
}
