package com.qcksys.ao3tracker.ui.screens.read

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Surface
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.navigator.tab.LocalTabNavigator
import com.qcksys.ao3tracker.ui.components.Ao3WebView
import com.qcksys.ao3tracker.ui.components.OfflineAo3WebView
import com.qcksys.ao3tracker.data.offline.OfflineCoordinator
import com.qcksys.ao3tracker.data.offline.offlineLocation
import com.qcksys.ao3tracker.data.database.SavedSearchEntity
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import com.qcksys.ao3tracker.ui.navigation.TrackTab
import org.koin.compose.koinInject

private val WORK_URL_REGEX = Regex("/works/\\d+")

@Composable
fun ReadScreen() {
    val screenModel = koinInject<ReadScreenModel>()
    val appSettings = koinInject<AppSettings>()
    val offline = koinInject<OfflineCoordinator>()
    val savedChapter by screenModel.savedChapter.collectAsState()
    val liveReaderSession by screenModel.liveReaderSession.collectAsState()
    val capture by offline.capture.collectAsState()
    val downloadMessage by offline.message.collectAsState()
    val unavailableDestination by screenModel.unavailableDestination.collectAsState()
    val downloads by offline.downloads.collectAsState()
    val incognitoModeEnabled by appSettings.incognitoModeEnabled.collectAsState()
    val currentUrl by screenModel.currentUrl.collectAsState()
    val scrollProgress by screenModel.scrollProgress.collectAsState()
    val tabNavigator = LocalTabNavigator.current
    val snackbarHostState = remember { SnackbarHostState() }

    DisposableEffect(screenModel) { onDispose { screenModel.leaveReader() } }
    LaunchedEffect(screenModel) { screenModel.resumeReader() }
    LaunchedEffect(downloadMessage) {
        downloadMessage?.let { snackbarHostState.showSnackbar(it); offline.dismissMessage() }
    }

    LaunchedEffect(screenModel) {
        screenModel.linkActionMessage.collect { snackbarHostState.showSnackbar(it) }
    }

    // Handle pending navigation from other tabs
    val pendingNavigation by NavigationState.pendingNavigation.collectAsState()
    LaunchedEffect(pendingNavigation) {
        pendingNavigation?.let { nav ->
            screenModel.navigateToReadingPosition(nav)
            NavigationState.clearPendingNavigation()
        }
    }

    // Handle home navigation when Read tab is re-tapped
    val navigateToHome by NavigationState.navigateReadToHome.collectAsState()
    LaunchedEffect(navigateToHome) {
        if (navigateToHome) {
            screenModel.navigateToHome()
            NavigationState.clearReadTabHome()
        }
    }

    val showProgressBar = remember(currentUrl) {
        WORK_URL_REGEX.containsMatchIn(currentUrl)
    }

    unavailableDestination?.let { destination ->
        val location = runCatching { offlineLocation(destination) }.getOrNull()
        val workId = location?.workId
        val wholeWork = location?.representation == "whole"
        val saved = downloads.firstOrNull { it.work.workId.toString() == workId }
        AlertDialog(
            onDismissRequest = screenModel::dismissUnavailableDestination,
            title = { Text(if (wholeWork) "Read saved chapters" else if (location == null) "Connection required" else "Chapter not saved") },
            text = {
                Column {
                    Text(if (wholeWork) "Offline downloads use chapter view. Choose a saved chapter, or open the whole-work view online. Your current page remains open."
                        else "This destination is unavailable offline. Your current chapter remains open.")
                    val available = saved?.chapters?.filter { it.id in saved.savedChapterIds }.orEmpty()
                    LazyColumn(Modifier.fillMaxWidth().heightIn(max = 240.dp)) {
                        items(if (wholeWork) available else available.takeLast(1), key = { it.id }) { chapter ->
                            TextButton(onClick = { screenModel.openSavedOrLive(chapter.url, 0f) }) { Text("Open saved chapter ${chapter.number}") }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = screenModel::tryUnavailableOnline) { Text("Try online") } },
            dismissButton = { TextButton(onClick = screenModel::dismissUnavailableDestination) { Text("Stay here") } }
        )
    }

    // Dialog for the in-page "Save this search" button.
    val pendingSaveSearch by screenModel.pendingSaveSearch.collectAsState()
    pendingSaveSearch?.let { event ->
        val savedSearches by screenModel.savedSearches.collectAsState(initial = emptyList())
        SaveSearchDialog(
            suggestedName = event.name?.takeIf { it.isNotBlank() } ?: "AO3 search",
            savedSearches = savedSearches,
            onConfirm = { name -> screenModel.confirmSaveSearch(name, event.url) },
            onUpdate = { id -> screenModel.confirmUpdateSavedSearch(id, event.url) },
            onDismiss = { screenModel.dismissSaveSearch() }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        if (incognitoModeEnabled) {
            Surface(color = MaterialTheme.colorScheme.secondaryContainer) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Incognito · tracking paused", modifier = Modifier.weight(1f))
                    TextButton(onClick = { appSettings.setIncognitoModeEnabled(false) }) {
                        Text("Turn off")
                    }
                }
            }
        }
        OfflineReaderControls(offline, screenModel, currentUrl, savedChapter, incognitoModeEnabled)
        // Reading progress bar (only on work pages)
        if (showProgressBar) {
            LinearProgressIndicator(
                progress = { scrollProgress },
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                drawStopIndicator = {}
            )
        }

        Box(Modifier.weight(1f)) {
            val opened = savedChapter
            if (opened != null) key(opened.document.token) {
                OfflineAo3WebView(opened.document, Modifier.fillMaxSize(),
                    onEvent = { screenModel.handleOfflineEvent(opened, it) },
                    onFailure = { offline.notify("This saved chapter could not be displayed. Update the saved work when connected.") },
                    onBack = { if (!screenModel.goBack()) tabNavigator.current = TrackTab })
            } else key(liveReaderSession) { Ao3WebView(
                url = currentUrl,
                modifier = Modifier.fillMaxSize(),
                onNavigationStateChange = { back, forward ->
                    screenModel.updateNavigationState(back, forward)
                },
                onUrlChange = { url ->
                    screenModel.updateCurrentUrl(url)
                },
                onMessage = { message ->
                    if (screenModel.liveReaderSession.value == liveReaderSession) screenModel.handleWebViewMessage(message)
                },
                onLoadingStateChange = { isLoading ->
                    screenModel.updateLoadingState(isLoading)
                },
                onBackAtRoot = {
                    tabNavigator.current = TrackTab
                },
                jsInjectionFlow = screenModel.jsInjectionFlow,
                onLinkAction = screenModel::handleLinkAction,
                offlineCapture = capture,
                onOfflinePage = screenModel::observeOfflinePage,
                onNavigate = screenModel::interceptNavigation,
                onBack = screenModel::goBack,
                onLoadFailure = screenModel::liveLoadFailed
            ) }
            SnackbarHost(snackbarHostState, Modifier.align(Alignment.BottomCenter))
        }
    }
}

@Composable
internal fun SaveSearchDialog(
    suggestedName: String,
    savedSearches: List<SavedSearchEntity>,
    onConfirm: (String) -> Unit,
    onUpdate: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf(suggestedName) }
    var updating by remember { mutableStateOf(false) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var expanded by remember { mutableStateOf(false) }
    val liveSearches = savedSearches.filterNot { it.deleted }
    val selected = liveSearches.find { it.id == selectedId }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Save this search") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (updating) {
                    Text("Update saved search to match the current filters. Its name stays the same.")
                    Box {
                        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                            Text(selected?.name ?: "Choose saved search")
                        }
                        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            liveSearches.forEach { search ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Text(search.name)
                                            Text(search.url, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                                        }
                                    },
                                    onClick = {
                                        selectedId = search.id
                                        expanded = false
                                    }
                                )
                            }
                        }
                    }
                    TextButton(onClick = { updating = false }) { Text("Save as new search instead") }
                } else {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it.take(191) },
                        label = { Text("Name") },
                        singleLine = true
                    )
                    if (liveSearches.isNotEmpty()) {
                        TextButton(onClick = { updating = true }) { Text("Update saved search to match") }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (updating) selected?.let { onUpdate(it.id) } else onConfirm(name)
                },
                enabled = if (updating) selected != null else name.isNotBlank()
            ) {
                Text(if (updating) "Update" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
