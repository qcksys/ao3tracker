package com.qcksys.ao3tracker.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReaderLinkSheet(
    link: ReaderLink,
    onDismiss: () -> Unit,
    onCopy: () -> Unit,
    onOpenInBrowser: () -> Unit,
    onAction: (ReaderLinkAction) -> Unit
) {
    fun select(action: () -> Unit) {
        onDismiss()
        action()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = 16.dp)) {
            Text(
                text = link.tag ?: link.title ?: link.workId?.let { "Work $it" } ?: "Link",
                style = MaterialTheme.typography.titleLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 24.dp)
            )
            Text(
                text = link.url,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
            )
            link.workId?.let { workId ->
                DropdownMenuItem(
                    text = { Text("Add to tracked works") },
                    leadingIcon = { Icon(Icons.Default.Add, contentDescription = null) },
                    onClick = { select { onAction(ReaderLinkAction.TrackWork(workId, link.title)) } }
                )
                DropdownMenuItem(
                    text = { Text("Hide / add to blocklist") },
                    leadingIcon = { Icon(Icons.Default.VisibilityOff, contentDescription = null) },
                    onClick = { select { onAction(ReaderLinkAction.BlockWork(workId, link.title)) } }
                )
            }
            link.tag?.let { tag ->
                DropdownMenuItem(
                    text = { Text("Add to blocklist") },
                    leadingIcon = { Icon(Icons.Default.Block, contentDescription = null) },
                    onClick = { select { onAction(ReaderLinkAction.BlockTag(tag)) } }
                )
            }
            if (link.workId != null || link.tag != null) HorizontalDivider()
            DropdownMenuItem(
                text = { Text("Copy") },
                leadingIcon = { Icon(Icons.Default.ContentCopy, contentDescription = null) },
                onClick = { select(onCopy) }
            )
            DropdownMenuItem(
                text = { Text("Open in browser") },
                leadingIcon = { Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null) },
                onClick = { select(onOpenInBrowser) }
            )
        }
    }
}
