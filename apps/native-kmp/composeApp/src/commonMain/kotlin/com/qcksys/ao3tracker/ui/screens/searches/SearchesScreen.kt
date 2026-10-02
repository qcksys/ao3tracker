package com.qcksys.ao3tracker.ui.screens.searches

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import com.qcksys.ao3tracker.data.database.SearchCheckEntity
import com.qcksys.ao3tracker.ui.components.Ao3WebView
import com.qcksys.ao3tracker.util.plainTextClipEntry
import com.qcksys.ao3tracker.webview.SearchCheckScriptGenerated
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.time.Instant
import org.koin.compose.koinInject

@Composable
fun SearchesScreen() {
    val screenModel = koinInject<SearchesScreenModel>()
    val searches by screenModel.savedSearches.collectAsState()
    val checks by screenModel.checks.collectAsState()
    val runningCheck by screenModel.runningCheck.collectAsState()
    val isChecking by screenModel.isChecking.collectAsState()
    val errors by screenModel.errors.collectAsState()
    val checkStatus by screenModel.checkStatus.collectAsState()

    LaunchedEffect(screenModel) { screenModel.checkAll(automatic = true) }
    DisposableEffect(screenModel) { onDispose { screenModel.cancelChecks() } }

    SearchesScreenContent(
        searches = searches,
        onOpen = screenModel::openSearch,
        onRename = screenModel::renameSavedSearch,
        onDelete = screenModel::deleteSavedSearch,
        checks = checks.associateBy { it.searchId },
        runningCheck = runningCheck,
        isChecking = isChecking,
        errors = errors,
        onCheck = screenModel::checkSearch,
        onCheckAll = { screenModel.checkAll() },
        onCancelChecks = screenModel::cancelChecks,
        onFullScan = screenModel::fullScan,
        checkStatus = checkStatus
    )
    runningCheck?.let { check ->
        key(check.runId) {
            val script = remember(check.runId) {
                val options = buildJsonObject {
                    put("url", check.request.search.url)
                    put("hiddenTags", JsonArray(check.preferences.hiddenTags.map(::JsonPrimitive)))
                    put("hiddenWorkIds", JsonArray(check.preferences.hiddenWorkIds.map(::JsonPrimitive)))
                    put("language", if (check.preferences.languageFilterEnabled) check.preferences.searchLanguage else null)
                    put("maxFandoms", check.preferences.maxFandoms)
                    put("previousContext", check.request.previous?.context)
                    put("since", check.request.previous?.checkedAt)
                    put("fullScan", check.fullScan)
                    put("resumeUrl", check.request.previous?.resumeUrl)
                }.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
                "window.__ao3SearchCheckOptions = $options;\n${SearchCheckScriptGenerated.script}"
            }
            Ao3WebView(
                url = check.request.search.url,
                pageScript = script,
                onMessage = { screenModel.onCheckMessage(check.runId, it) },
                modifier = Modifier.size(1.dp).alpha(0f).clearAndSetSemantics {}
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SearchesScreenContent(
    searches: List<SavedSearchEntity>,
    onOpen: (String) -> Unit,
    onRename: (String, String) -> Unit,
    onDelete: (String) -> Unit,
    checks: Map<String, SearchCheckEntity> = emptyMap(),
    runningCheck: RunningSearchCheck? = null,
    isChecking: Boolean = false,
    errors: Map<String, String> = emptyMap(),
    onCheck: (String) -> Unit = {},
    onCheckAll: () -> Unit = {},
    onCancelChecks: () -> Unit = {},
    onFullScan: (String) -> Unit = {},
    checkStatus: String? = null
) {
    var renaming by remember { mutableStateOf<SavedSearchEntity?>(null) }
    var scanning by remember { mutableStateOf<SavedSearchEntity?>(null) }
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Searches") },
                actions = {
                    if (isChecking) {
                        TextButton(onClick = onCancelChecks) { Text("Stop checks") }
                    } else {
                        IconButton(onClick = onCheckAll, enabled = searches.isNotEmpty()) {
                            Icon(Icons.Default.Refresh, contentDescription = "Check all searches")
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
            if (searches.isEmpty()) {
                Text(
                    text = "No saved searches yet. Open an AO3 works or bookmarks page in the Read tab and tap \"Save this search\".",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp)
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    item {
                        Text(
                            checkStatus ?: "Recent updates only; older changes may be missed. Counts stay until you open the search.",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(8.dp)
                        )
                    }
                    items(searches, key = { it.id }) { search ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpen(search.url) }
                                .padding(horizontal = 8.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = search.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = search.url,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                val check = checks[search.id]?.takeIf { it.url == search.url }
                                Text(
                                    text = when {
                                        runningCheck?.request?.search?.id == search.id -> "${if (runningCheck.fullScan) "Full scan" else "Checking"} · ${runningCheck.pages} pages read"
                                        check == null -> "Not checked on this device"
                                        check.previousCheckedAt == null -> "Baseline saved on this device"
                                        else -> "${check.newWorks} newly found · ${check.updatedWorks} updated works"
                                    },
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                check?.let {
                                    val checked = Instant.fromEpochMilliseconds(it.checkedAt)
                                        .toLocalDateTime(TimeZone.currentSystemDefault()).toString().replace('T', ' ').take(16)
                                    Text("Checked $checked", style = MaterialTheme.typography.bodySmall)
                                    if (it.partial) Text("Partial results · Refresh to continue from the next page.", style = MaterialTheme.typography.bodySmall)
                                }
                                TextButton(onClick = { scanning = search }, enabled = !isChecking) {
                                    Text("Full scan")
                                }
                                errors[search.id]?.let { error ->
                                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            IconButton(onClick = { onCheck(search.id) }, enabled = !isChecking) {
                                if (runningCheck?.request?.search?.id == search.id) {
                                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                                } else {
                                    Icon(Icons.Default.Refresh, contentDescription = "Check ${search.name}")
                                }
                            }
                            IconButton(onClick = {
                                scope.launch {
                                    val message = try {
                                        clipboard.setClipEntry(plainTextClipEntry(search.url))
                                        "Link copied"
                                    } catch (e: CancellationException) {
                                        throw e
                                    } catch (_: Exception) {
                                        "Couldn't copy link. Try again."
                                    }
                                    snackbarHostState.currentSnackbarData?.dismiss()
                                    snackbarHostState.showSnackbar(message)
                                }
                            }) {
                                Icon(
                                    imageVector = Icons.Default.ContentCopy,
                                    contentDescription = "Copy link for ${search.name}"
                                )
                            }
                            IconButton(onClick = { renaming = search }) {
                                Icon(
                                    imageVector = Icons.Default.Edit,
                                    contentDescription = "Rename ${search.name}"
                                )
                            }
                            IconButton(onClick = { onDelete(search.id) }) {
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = "Delete ${search.name}"
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    scanning?.let { search ->
        AlertDialog(
            onDismissRequest = { scanning = null },
            title = { Text("Full scan of ${search.name}?") },
            text = { Text("Reads every results page, including older works. Large searches can take many requests and several minutes. The first full scan establishes a baseline for older works.") },
            confirmButton = {
                TextButton(onClick = { scanning = null; onFullScan(search.id) }) { Text("Start full scan") }
            },
            dismissButton = { TextButton(onClick = { scanning = null }) { Text("Cancel") } }
        )
    }

    renaming?.let { search ->
        RenameSavedSearchDialog(
            currentName = search.name,
            onConfirm = { name ->
                onRename(search.id, name)
                renaming = null
            },
            onDismiss = { renaming = null }
        )
    }
}

@Composable
private fun RenameSavedSearchDialog(
    currentName: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf(currentName) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename search") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.take(191) },
                label = { Text("Name") },
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(name) },
                enabled = name.isNotBlank()
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
