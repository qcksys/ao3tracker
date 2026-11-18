package com.qcksys.ao3tracker.ui.screens.track

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import com.qcksys.ao3tracker.data.model.TagFilterMode
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test

class TriStateFilterChipTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun eachFilterModeHasAnAccessibleStateAndLongPressStillPinsTheTag() {
        val mode = mutableStateOf(TagFilterMode.DEFAULT)
        var pinned = false
        rule.setContent {
            MaterialTheme {
                TriStateFilterChip(mode.value, onClick = {
                    mode.value = TagFilterMode.entries[(mode.value.ordinal + 1) % TagFilterMode.entries.size]
                }, label = "Fluff", onLongClick = { pinned = true })
            }
        }
        val chip = rule.onNodeWithText("Fluff")
        for ((description, state) in listOf("Neutral" to ToggleableState.Off, "Included" to ToggleableState.On,
            "Excluded" to ToggleableState.Indeterminate)) {
            val semantics = chip.fetchSemanticsNode().config
            assertEquals(description, semantics[SemanticsProperties.StateDescription])
            assertEquals(state, semantics[SemanticsProperties.ToggleableState])
            chip.performClick()
        }
        chip.performTouchInput { longClick() }
        assertTrue(pinned)
        assertEquals(TagFilterMode.DEFAULT, mode.value)
    }
}
