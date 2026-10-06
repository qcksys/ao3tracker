package com.qcksys.ao3tracker.ui.screens.settings

import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.model.SyncResult
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.settings.ApiEnvironment
import com.qcksys.ao3tracker.data.settings.defaultApiEnvironment
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.ui.components.Ao3LinkSettings
import com.qcksys.ao3tracker.ui.components.SyncDebugDialog
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import com.qcksys.ao3tracker.ui.screens.track.DownloadsScreen
import com.qcksys.ao3tracker.data.sync.SyncCoordinator
import com.qcksys.ao3tracker.data.push.NotificationItem
import com.qcksys.ao3tracker.data.push.NotificationPreferences
import com.qcksys.ao3tracker.data.push.NotificationType
import com.qcksys.ao3tracker.data.push.getPushTokenStorage
import com.qcksys.ao3tracker.util.shareText
import com.qcksys.ao3tracker.diagnostics.PostHogCrashReporter
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Instant
import org.jetbrains.compose.resources.painterResource
import org.koin.compose.koinInject
import ao3tracker.composeapp.generated.resources.Res
import ao3tracker.composeapp.generated.resources.app_logo
import ao3tracker.composeapp.generated.resources.app_logo_beta

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val navigator = LocalNavigator.currentOrThrow
    val accountData = koinInject<AccountDataStore>()
    val activeAccount by accountData.active.collectAsState()
    val repository = koinInject<Ao3Repository>()
    val authRepository = koinInject<AuthRepository>()
    val pushRepository = koinInject<com.qcksys.ao3tracker.data.push.PushRepository>()
    val syncCoordinator = koinInject<SyncCoordinator>()
    val appSettings = koinInject<AppSettings>()
    val screenModel = remember { SettingsScreenModel(repository) }
    val workCount by screenModel.workCount.collectAsState()
    val exportState by screenModel.exportState.collectAsState()
    val authState by authRepository.authState.collectAsState()
    val syncState by syncCoordinator.syncState.collectAsState()
    var showSyncDebug by remember { mutableStateOf(false) }
    val devModeEnabled by appSettings.devModeEnabled.collectAsState()
    val apiEnvironment by appSettings.apiEnvironment.collectAsState()
    val autoSyncOnOpen by appSettings.autoSyncOnOpenEnabled.collectAsState()
    val incognitoModeEnabled by appSettings.incognitoModeEnabled.collectAsState()
    val diagnosticDataEnabled by appSettings.diagnosticDataEnabled.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val lastSyncResult by syncCoordinator.lastSyncResult.collectAsState()
    var showDeleteConfirmDialog by remember(activeAccount?.owner) { mutableStateOf(false) }
    val isSyncingOut by syncCoordinator.isSigningOut.collectAsState()
    var importOwner by remember(activeAccount?.owner) { mutableStateOf<String?>(null) }
    var isImportingGuest by remember { mutableStateOf(false) }

    if (showSyncDebug) {
        SyncDebugDialog(syncState = syncState, onDismiss = { showSyncDebug = false })
    }

    importOwner?.let { owner ->
        AlertDialog(
            onDismissRequest = { importOwner = null },
            title = { Text("Import from guest?") },
            text = {
                Text("Copy guest works, reading progress, favourite tags and saved searches into this account. " +
                    "Works and saved items already in this account are kept as they are. Guest data stays available when you sign out.")
            },
            confirmButton = {
                TextButton(onClick = {
                    importOwner = null
                    isImportingGuest = true
                    scope.launch {
                        try {
                            val result = authRepository.importGuestData(owner)
                            snackbarHostState.showSnackbar(
                                if (result.isEmpty) "No new guest data to import"
                                else "Imported ${result.works} works, ${result.favourites} favourite tags and ${result.searches} saved searches. Sync to upload them."
                            )
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            snackbarHostState.showSnackbar("Import failed: ${e.message}")
                        } finally {
                            isImportingGuest = false
                        }
                    }
                }) { Text("Import") }
            },
            dismissButton = { TextButton(onClick = { importOwner = null }) { Text("Cancel") } }
        )
    }

    // Show sync result
    LaunchedEffect(lastSyncResult) {
        lastSyncResult?.let { completion ->
            val result = completion.result
            val message = if (completion.signedOut) "Signed out and cleared local data" else when (result) {
                is SyncResult.Success -> "Sync complete: ${result.worksFromServer} works, ${result.chaptersFromServer} chapters from server; ${result.worksToServer} works, ${result.chaptersToServer} chapters to server"
                is SyncResult.Error -> "Sync failed: ${result.message}"
                is SyncResult.NotAuthenticated -> "Please sign in to sync"
            }
            snackbarHostState.showSnackbar(message)
            syncCoordinator.clearLastSyncResult(completion)
        }
    }

    // Show error messages
    LaunchedEffect(authState) {
        if (authState is AuthState.Error) {
            snackbarHostState.showSnackbar((authState as AuthState.Error).message)
            authRepository.clearError()
        }
    }

    // Delete confirmation dialog
    if (showDeleteConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmDialog = false },
            title = { Text("Delete This Library?") },
            text = {
                Text("This will permanently delete works, chapters, favourite tags and saved searches from the current local library. Other local libraries are kept. This action cannot be undone.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        showDeleteConfirmDialog = false
                        screenModel.deleteAllLocalData { result ->
                            scope.launch {
                                if (result.isSuccess) {
                                    snackbarHostState.showSnackbar("Current local library deleted")
                                } else {
                                    snackbarHostState.showSnackbar("Failed to delete data: ${result.exceptionOrNull()?.message}")
                                }
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text("Settings") }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Account section
            AccountSection(
                authState = authState,
                hasCredentialSupport = authRepository.hasCredentialSupport(),
                onSignIn = { email, password ->
                    scope.launch { authRepository.signIn(email, password) }
                },
                onSignUp = { name, email, password ->
                    scope.launch { authRepository.signUp(name, email, password) }
                },
                onSignOut = {
                    scope.launch {
                        pushRepository.unregisterToken()
                        authRepository.signOut()
                    }
                },
                onSignOutSyncAndClear = { syncCoordinator.requestSignOut() },
                isSyncingOut = isSyncingOut || isImportingGuest,
                onSignInWithSavedCredentials = {
                    scope.launch {
                        when (val result = authRepository.signInWithSavedCredentials()) {
                            is com.qcksys.ao3tracker.data.auth.CredentialResult.Error -> {
                                snackbarHostState.showSnackbar(result.message)
                            }
                            is com.qcksys.ao3tracker.data.auth.CredentialResult.Cancelled -> {
                                // User cancelled, do nothing
                            }
                            is com.qcksys.ao3tracker.data.auth.CredentialResult.NotSupported -> {
                                snackbarHostState.showSnackbar("Credential manager not available")
                            }
                            else -> {
                                // Success handled by auth state
                            }
                        }
                    }
                },
                onRegisterPasskey = {
                    scope.launch {
                        when (val result = authRepository.registerPasskey()) {
                            is com.qcksys.ao3tracker.data.auth.CredentialResult.Passkey -> {
                                snackbarHostState.showSnackbar("Passkey registered successfully")
                            }
                            is com.qcksys.ao3tracker.data.auth.CredentialResult.Error -> {
                                snackbarHostState.showSnackbar(result.message)
                            }
                            is com.qcksys.ao3tracker.data.auth.CredentialResult.Cancelled -> {
                                // User cancelled
                            }
                            is com.qcksys.ao3tracker.data.auth.CredentialResult.NotSupported -> {
                                snackbarHostState.showSnackbar("Passkey not supported on this device")
                            }
                            else -> {}
                        }
                    }
                }
            )

            SettingsSection(
                title = "Reading",
                summary = if (incognitoModeEnabled) "Incognito on · Tracking paused" else "Incognito off · Tracking enabled",
                icon = Icons.Default.Book
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Incognito mode", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        Switch(
                            checked = incognitoModeEnabled,
                            onCheckedChange = appSettings::setIncognitoModeEnabled,
                            modifier = Modifier.semantics { contentDescription = "Incognito mode" }
                        )
                    }
                    Text(
                        "Pauses automatic saves and reading progress on this device. " +
                            "Explicit downloads are still saved. AO3 stays signed in, and your existing library can still sync.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Ao3LinkSettings()
                }
            }

            OfflineStorageSettings(appSettings, onManageDownloads = { navigator.push(DownloadsScreen()) })

            BrowsingSettings(appSettings, onOpenHiddenWorks = { navigator.push(HiddenWorksScreen()) })

            SettingsSection(
                title = "Privacy",
                summary = if (diagnosticDataEnabled) "Diagnostic data enabled" else "Diagnostic data disabled",
                icon = Icons.Default.BugReport
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Send diagnostic data", modifier = Modifier.weight(1f))
                        Switch(
                            checked = diagnosticDataEnabled,
                            onCheckedChange = appSettings::setDiagnosticDataEnabled,
                            modifier = Modifier.semantics { contentDescription = "Send diagnostic data" }
                        )
                    }
                    Text(
                        "Help improve AO3 Tracker with app and reader feature usage, error counts, and PostHog crash reports. " +
                            "Usage events contain no reading content, work IDs, search terms, or account details. " +
                            "Turning this off stops new diagnostic collection on this device."
                    )
                }
            }

            SettingsSection(
                title = "Sync",
                summary = when {
                    syncState.isSyncing -> syncState.statusMessage ?: "Syncing..."
                    authState !is AuthState.Authenticated -> "Sign in to sync across devices"
                    autoSyncOnOpen -> "Sync on open enabled"
                    else -> "Manual sync · Sync on open disabled"
                },
                icon = Icons.Default.Sync
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    // Auto sync on open toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Sync on open",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                text = "Automatically sync when app opens",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = autoSyncOnOpen,
                            onCheckedChange = { appSettings.setAutoSyncOnOpenEnabled(it) }
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    HorizontalDivider()

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = "Full sync uploads all local tracks to the server and downloads all server tracks. Use this when setting up a new device or to resolve sync issues.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // Last sync info
                    syncState.lastSyncedAt?.let { lastSync ->
                        Text(
                            text = "Last synced: ${formatLastSyncTime(lastSync)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    Button(
                        onClick = {
                            if (syncState.isSyncing) showSyncDebug = true else syncCoordinator.requestSync(forceFull = true)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = authState is AuthState.Authenticated
                    ) {
                        if (syncState.isSyncing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                            Text(
                                text = syncState.statusMessage ?: "Syncing...",
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Sync,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = "Full Sync",
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                    }

                    if (authState !is AuthState.Authenticated) {
                        Text(
                            text = "Sign in to enable sync",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            }

            // Push Notifications section
            PushNotificationsSection(
                isAuthenticated = authState is AuthState.Authenticated,
                pushRepository = pushRepository,
                appSettings = appSettings,
                snackbarHostState = snackbarHostState
            )

            SettingsSection(
                title = "Library & data",
                summary = "$workCount tracked works · Import, export and delete",
                icon = Icons.Default.FileDownload
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = when (activeAccount?.owner) {
                            null -> "Loading library..."
                            AccountDataStore.GUEST -> "Guest library"
                            else -> (authState as? AuthState.Authenticated)?.user?.email ?: "Saved account library"
                        },
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "Each account and guest has its own library on this device. Signing out keeps your data for the next sign-in.",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    val signedInOwner = authRepository.currentOwner()
                    if (signedInOwner != null && signedInOwner == activeAccount?.owner) {
                        OutlinedButton(
                            onClick = { importOwner = signedInOwner },
                            enabled = !isImportingGuest && !isSyncingOut && !syncState.isSyncing,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(if (isImportingGuest) "Importing..." else "Import from guest")
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Tracked Works",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = workCount.toString(),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                    Button(
                        onClick = {
                            screenModel.exportData { jsonData ->
                                shareText(
                                    text = jsonData,
                                    filename = "ao3tracker-export.json",
                                    mimeType = "application/json"
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = exportState !is ExportState.Loading
                    ) {
                        if (exportState is ExportState.Loading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.FileDownload,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Text(
                            text = if (exportState is ExportState.Loading) "Exporting..." else "Export Data as JSON",
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Button(
                        onClick = { showDeleteConfirmDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.DeleteForever,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = "Delete Current Library",
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }
                }
            }

            SettingsSection(
                title = "About",
                summary = "App information, privacy and contact",
                icon = Icons.Default.Info
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // App logo and name
                    Image(
                        painter = painterResource(
                            if (defaultApiEnvironment() == ApiEnvironment.DEV) Res.drawable.app_logo_beta
                            else Res.drawable.app_logo
                        ),
                        contentDescription = "AO3 Tracker Logo",
                        modifier = Modifier
                            .size(80.dp)
                            .clip(RoundedCornerShape(16.dp))
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = "AO3 Tracker",
                        style = MaterialTheme.typography.headlineSmall
                    )

                    AppVersionInfo()

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Track your reading progress on Archive of Our Own. " +
                                "Works and chapters are automatically tracked when you browse AO3 in the Read tab.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                    // Privacy & Data section
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = "Privacy & Data",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "This app is completely free and not monetized. " +
                                "No work content is stored - only your reading progress (work IDs, chapter positions, and timestamps). " +
                                "Creating an account is optional and only needed to sync progress across devices.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = buildAnnotatedString {
                            append("Contact: ")
                            withLink(
                                LinkAnnotation.Url(
                                    url = "mailto:hello@ao3tracker.com",
                                    styles = TextLinkStyles(
                                        style = SpanStyle(textDecoration = TextDecoration.Underline)
                                    )
                                )
                            ) {
                                append("hello@ao3tracker.com")
                            }
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            // Developer section
            DeveloperSection(
                devModeEnabled = devModeEnabled,
                onDevModeChanged = { enabled ->
                    if (!enabled && appSettings.canSelectApiEnvironment && apiEnvironment != defaultApiEnvironment()) {
                        scope.launch {
                            pushRepository.unregisterToken()
                            authRepository.signOut()
                            appSettings.setApiEnvironment(defaultApiEnvironment())
                        }
                    }
                    appSettings.setDevModeEnabled(enabled)
                },
                apiEnvironment = apiEnvironment,
                canSelectApiEnvironment = appSettings.canSelectApiEnvironment,
                onApiEnvironmentChanged = { env ->
                    if (env != apiEnvironment) {
                        // Auto logout when changing API environment
                        scope.launch {
                            pushRepository.unregisterToken()
                            authRepository.signOut()
                            appSettings.setApiEnvironment(env)
                            snackbarHostState.showSnackbar("Signed out due to API change")
                        }
                    }
                },
                currentUserEmail = (authState as? AuthState.Authenticated)?.user?.email
            )

            // Disclaimer
            Text(
                text = "This app is not affiliated with Archive of Our Own or the Organization for Transformative Works.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

@Composable
private fun AccountSection(
    authState: AuthState,
    hasCredentialSupport: Boolean,
    onSignIn: (email: String, password: String) -> Unit,
    onSignUp: (name: String, email: String, password: String) -> Unit,
    onSignOut: () -> Unit,
    onSignOutSyncAndClear: () -> Unit,
    isSyncingOut: Boolean,
    onSignInWithSavedCredentials: () -> Unit,
    onRegisterPasskey: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.AccountCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = "Account",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            when (authState) {
                is AuthState.Idle -> {
                    LoginForm(
                        onSignIn = onSignIn,
                        onSignUp = onSignUp,
                        onSignInWithSavedCredentials = onSignInWithSavedCredentials,
                        hasCredentialSupport = hasCredentialSupport,
                        isLoading = false
                    )
                }
                is AuthState.Loading -> {
                    LoginForm(
                        onSignIn = onSignIn,
                        onSignUp = onSignUp,
                        onSignInWithSavedCredentials = onSignInWithSavedCredentials,
                        hasCredentialSupport = hasCredentialSupport,
                        isLoading = true
                    )
                }
                is AuthState.Authenticated -> {
                    AuthenticatedView(
                        user = authState.user,
                        hasCredentialSupport = hasCredentialSupport,
                        onSignOut = onSignOut,
                        onSignOutSyncAndClear = onSignOutSyncAndClear,
                        isSyncingOut = isSyncingOut,
                        onRegisterPasskey = onRegisterPasskey
                    )
                }
                is AuthState.Error -> {
                    LoginForm(
                        onSignIn = onSignIn,
                        onSignUp = onSignUp,
                        onSignInWithSavedCredentials = onSignInWithSavedCredentials,
                        hasCredentialSupport = hasCredentialSupport,
                        isLoading = false
                    )
                }
            }
        }
    }
}

@Composable
private fun LoginForm(
    onSignIn: (email: String, password: String) -> Unit,
    onSignUp: (name: String, email: String, password: String) -> Unit,
    onSignInWithSavedCredentials: () -> Unit,
    hasCredentialSupport: Boolean,
    isLoading: Boolean
) {
    var isSignUp by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "Sign in to sync your reading progress across devices.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        // Show saved credentials button for sign-in (not sign-up)
        if (!isSignUp && hasCredentialSupport) {
            OutlinedButton(
                onClick = onSignInWithSavedCredentials,
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading
            ) {
                Icon(
                    imageVector = Icons.Default.Fingerprint,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text("Sign in with saved credentials")
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                HorizontalDivider(modifier = Modifier.weight(1f))
                Text(
                    text = "or",
                    modifier = Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                HorizontalDivider(modifier = Modifier.weight(1f))
            }
        }

        if (isSignUp) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Name") },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading,
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Next
                )
            )
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading,
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next
            )
        )

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading,
            singleLine = true,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done
            ),
            trailingIcon = {
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    Icon(
                        imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = if (passwordVisible) "Hide password" else "Show password"
                    )
                }
            }
        )

        Button(
            onClick = {
                if (isSignUp) {
                    onSignUp(name, email, password)
                } else {
                    onSignIn(email, password)
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading && email.isNotBlank() && password.isNotBlank() && (!isSignUp || name.isNotBlank())
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary
                )
            } else {
                Text(if (isSignUp) "Sign Up" else "Sign In")
            }
        }

        TextButton(
            onClick = {
                isSignUp = !isSignUp
                name = ""
                password = ""
            },
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) {
            Text(
                if (isSignUp) "Already have an account? Sign In" else "Don't have an account? Sign Up"
            )
        }
    }
}

@Composable
private fun AuthenticatedView(
    user: com.qcksys.ao3tracker.data.model.User?,
    hasCredentialSupport: Boolean,
    onSignOut: () -> Unit,
    onSignOutSyncAndClear: () -> Unit,
    isSyncingOut: Boolean,
    onRegisterPasskey: () -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (user != null) {
            InfoRow("Signed in as", user.email)
            if (user.name.isNotBlank()) {
                InfoRow("Name", user.name)
            }
        } else {
            Text("Signed in", style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (hasCredentialSupport) {
            OutlinedButton(
                onClick = onRegisterPasskey,
                modifier = Modifier.fillMaxWidth(),
                enabled = !isSyncingOut
            ) {
                Icon(
                    imageVector = Icons.Default.Fingerprint,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text("Add Passkey")
            }
        }

        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
            enabled = !isSyncingOut
        ) {
            Text("Sign Out & Keep Data")
        }

        OutlinedButton(
            onClick = onSignOutSyncAndClear,
            modifier = Modifier.fillMaxWidth(),
            enabled = !isSyncingOut
        ) {
            if (isSyncingOut) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text("Syncing & clearing...")
            } else {
                Text("Sync, Clear Data & Sign Out")
            }
        }
    }
}

@Composable
internal fun DeveloperSection(
    devModeEnabled: Boolean,
    onDevModeChanged: (Boolean) -> Unit,
    apiEnvironment: ApiEnvironment,
    canSelectApiEnvironment: Boolean,
    onApiEnvironmentChanged: (ApiEnvironment) -> Unit,
    currentUserEmail: String? = null
) {
    SettingsSection(
        title = "Advanced",
        summary = "${apiEnvironment.displayName} · Developer options",
        icon = Icons.Default.Code
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Dev Mode",
                    style = MaterialTheme.typography.bodyMedium
                )
                Switch(
                    checked = devModeEnabled,
                    onCheckedChange = onDevModeChanged
                )
            }

            if (devModeEnabled && canSelectApiEnvironment) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                Text(
                    text = "API Environment",
                    style = MaterialTheme.typography.bodyMedium
                )

                Spacer(modifier = Modifier.height(8.dp))

                var expanded by remember { mutableStateOf(false) }

                OutlinedButton(
                    onClick = { expanded = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(apiEnvironment.displayName)
                }

                DropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false }
                ) {
                    ApiEnvironment.entries.forEach { env ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(env.displayName)
                                    Text(
                                        text = env.authBaseUrl.removePrefix("https://").removeSuffix("/auth"),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            },
                            onClick = {
                                onApiEnvironmentChanged(env)
                                expanded = false
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Current: ${apiEnvironment.authBaseUrl.removePrefix("https://").removeSuffix("/auth")}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                currentUserEmail?.let { email ->
                    Text(
                        text = "Logged in as: $email",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            if (devModeEnabled) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                Text(
                    text = "Error Reporting",
                    style = MaterialTheme.typography.bodyMedium
                )

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedButton(
                    onClick = {
                        try {
                            throw RuntimeException("Test error from AO3 Tracker dev menu")
                        } catch (e: Exception) {
                            PostHogCrashReporter.captureException(e)
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        imageVector = Icons.Default.BugReport,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    Text("Send Test Error to PostHog")
                }
            }
        }
    }
}

@Composable
private fun PushNotificationsSection(
    isAuthenticated: Boolean,
    pushRepository: com.qcksys.ao3tracker.data.push.PushRepository,
    appSettings: AppSettings,
    snackbarHostState: SnackbarHostState
) {
    val pushTokenStorage = remember { getPushTokenStorage() }
    val isPushSupported = pushRepository.isPushSupported()
    val scope = rememberCoroutineScope()
    var isRegistering by remember { mutableStateOf(false) }
    var hasToken by remember { mutableStateOf(pushTokenStorage.getFcmToken() != null) }
    var showHistoryModal by remember { mutableStateOf(false) }
    val preferences by appSettings.notificationPreferences.collectAsState()
    var isSaving by remember { mutableStateOf(false) }
    val savePreferences: (NotificationPreferences) -> Unit = { updated ->
        scope.launch {
            isSaving = true
            try {
                pushRepository.updateNotificationPreferences(updated).onFailure {
                    snackbarHostState.showSnackbar("Could not save notification settings: ${it.message}")
                }
            } finally {
                isSaving = false
            }
        }
    }

    // Only show on supported platforms
    if (!isPushSupported) {
        return
    }

    // Show notification history modal
    if (showHistoryModal) {
        NotificationHistoryModal(
            onDismiss = { showHistoryModal = false },
            pushRepository = pushRepository
        )
    }

    SettingsSection(
        title = "Notifications",
        summary = when {
            isSaving -> "Saving notification settings..."
            isRegistering -> "Registering notifications..."
            !preferences.enabled -> "Off on this device"
            !isAuthenticated -> "Sign in to receive alerts"
            else -> "On this device · Alert types and history"
        },
        icon = if (preferences.enabled) Icons.Default.Notifications else Icons.Default.NotificationsOff
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "Choose alerts for subscribed works on this device. Other devices keep their own settings.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(12.dp))

            NotificationSettingRow("Enable notifications", preferences.enabled, !isSaving && !isRegistering) {
                savePreferences(preferences.copy(enabled = it))
            }
            NotificationSettingRow("New chapters", preferences.newChapters, preferences.enabled && !isSaving && !isRegistering) {
                savePreferences(preferences.copy(newChapters = it))
            }
            NotificationSettingRow("Completed works", preferences.workCompleted, preferences.enabled && !isSaving && !isRegistering) {
                savePreferences(preferences.copy(workCompleted = it))
            }
            NotificationSettingRow("Restricted works", preferences.workRestricted, preferences.enabled && !isSaving && !isRegistering) {
                savePreferences(preferences.copy(workRestricted = it))
            }
            NotificationSettingRow("Deleted works", preferences.workDeleted, preferences.enabled && !isSaving && !isRegistering) {
                savePreferences(preferences.copy(workDeleted = it))
            }
            if (isSaving) {
                Text("Saving notification settings…", style = MaterialTheme.typography.bodySmall)
            }
            Spacer(modifier = Modifier.height(12.dp))

            // Status indicator
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Status",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = when {
                        !preferences.enabled -> "Disabled on this device"
                        hasToken -> "Push token available"
                        else -> "No push token available"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (hasToken) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = {
                    scope.launch {
                        isRegistering = true
                        try {
                            val result = pushRepository.registerTokenIfNeeded()
                            result.onSuccess {
                                hasToken = pushTokenStorage.getFcmToken() != null
                                if (hasToken) {
                                    snackbarHostState.showSnackbar("Push notifications registered")
                                } else {
                                    snackbarHostState.showSnackbar("No push token available. Please ensure notifications are enabled in device settings.")
                                }
                            }.onFailure { error ->
                                snackbarHostState.showSnackbar("Failed to register: ${error.message}")
                            }
                        } finally {
                            isRegistering = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = isAuthenticated && preferences.enabled && !isRegistering && !isSaving
            ) {
                if (isRegistering) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Text(
                        text = "Registering...",
                        modifier = Modifier.padding(start = 8.dp)
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Notifications,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = if (hasToken) "Re-register Notifications" else "Enable Notifications",
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // View History button
            OutlinedButton(
                onClick = { showHistoryModal = true },
                modifier = Modifier.fillMaxWidth(),
                enabled = isAuthenticated
            ) {
                Icon(
                    imageVector = Icons.Default.History,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = "View Notification History",
                    modifier = Modifier.padding(start = 8.dp)
                )
            }

            if (!isAuthenticated) {
                Text(
                    text = "Sign in to enable push notifications",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun NotificationSettingRow(
    label: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
            modifier = Modifier.semantics { contentDescription = label }
        )
    }
}

/**
 * Formats an ISO 8601 timestamp to a human-readable local date and time.
 */
@OptIn(kotlin.time.ExperimentalTime::class)
private fun formatLastSyncTime(iso8601: String): String {
    return try {
        val instant = Instant.parse(iso8601)
        val localDateTime = instant.toLocalDateTime(TimeZone.currentSystemDefault())
        val month = localDateTime.month.name.lowercase().replaceFirstChar { it.uppercase() }.take(3)
        val day = localDateTime.day
        val year = localDateTime.year
        val hour = localDateTime.hour
        val minute = localDateTime.minute.toString().padStart(2, '0')
        val amPm = if (hour < 12) "AM" else "PM"
        val hour12 = when {
            hour == 0 -> 12
            hour > 12 -> hour - 12
            else -> hour
        }
        "$month $day, $year at $hour12:$minute $amPm"
    } catch (e: Exception) {
        iso8601.substringBefore("T")
    }
}

/**
 * Modal dialog displaying notification history with pagination support.
 */
@Composable
private fun NotificationHistoryModal(
    onDismiss: () -> Unit,
    pushRepository: com.qcksys.ao3tracker.data.push.PushRepository
) {
    var notifications by remember { mutableStateOf<List<NotificationItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var isLoadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var nextCursor by remember { mutableStateOf<Int?>(null) }
    var hasMore by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // Initial load
    LaunchedEffect(Unit) {
        scope.launch {
            isLoading = true
            error = null
            pushRepository.getNotificationHistory()
                .onSuccess { response ->
                    notifications = response.notifications
                    nextCursor = response.nextCursor
                    hasMore = response.hasMore
                }
                .onFailure { e ->
                    error = e.message ?: "Failed to load notifications"
                }
            isLoading = false
        }
    }

    // Load more when scrolling to bottom
    LaunchedEffect(listState) {
        snapshotFlow { listState.layoutInfo }
            .distinctUntilChanged()
            .filter { layoutInfo ->
                val lastVisibleItem = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                val totalItems = layoutInfo.totalItemsCount
                hasMore && !isLoadingMore && lastVisibleItem >= totalItems - 3
            }
            .collect {
                if (nextCursor != null) {
                    isLoadingMore = true
                    pushRepository.getNotificationHistory(cursor = nextCursor)
                        .onSuccess { response ->
                            notifications = notifications + response.notifications
                            nextCursor = response.nextCursor
                            hasMore = response.hasMore
                        }
                    isLoadingMore = false
                }
            }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.History,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text("Notification History")
            }
        },
        text = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 200.dp, max = 400.dp)
            ) {
                when {
                    isLoading -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                    error != null -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = error!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                    notifications.isEmpty() -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "No notifications yet",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    else -> {
                        LazyColumn(
                            state = listState,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(notifications, key = { it.id }) { notification ->
                                NotificationItemCard(notification = notification, onDismiss = onDismiss)
                            }
                            if (isLoadingMore) {
                                item {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(16.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(24.dp),
                                            strokeWidth = 2.dp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        }
    )
}

/**
 * Individual notification item card.
 */
@Composable
internal fun NotificationItemCard(notification: NotificationItem, onDismiss: () -> Unit) {
    Card(
        onClick = {
            onDismiss()
            NavigationState.navigateToWork(notification.workId.toLong())
        },
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = notification.title,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f)
                )
                NotificationTypeBadge(type = notification.type)
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = notification.body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = formatNotificationTime(notification.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Badge showing the notification type.
 */
@Composable
private fun NotificationTypeBadge(type: NotificationType) {
    val (text, color) = when (type) {
        NotificationType.new_chapters -> "New Chapters" to MaterialTheme.colorScheme.primary
        NotificationType.work_completed -> "Completed" to MaterialTheme.colorScheme.tertiary
        NotificationType.work_restricted -> "Restricted" to MaterialTheme.colorScheme.error
        NotificationType.work_deleted -> "Deleted" to MaterialTheme.colorScheme.error
    }

    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = color
    )
}

/**
 * Formats a notification timestamp to a human-readable format.
 */
@OptIn(kotlin.time.ExperimentalTime::class)
private fun formatNotificationTime(iso8601: String): String {
    return try {
        val instant = Instant.parse(iso8601)
        val localDateTime = instant.toLocalDateTime(TimeZone.currentSystemDefault())
        val month = localDateTime.month.name.lowercase().replaceFirstChar { it.uppercase() }.take(3)
        val day = localDateTime.day
        val hour = localDateTime.hour
        val minute = localDateTime.minute.toString().padStart(2, '0')
        val amPm = if (hour < 12) "AM" else "PM"
        val hour12 = when {
            hour == 0 -> 12
            hour > 12 -> hour - 12
            else -> hour
        }
        "$month $day at $hour12:$minute $amPm"
    } catch (e: Exception) {
        iso8601.substringBefore("T")
    }
}
