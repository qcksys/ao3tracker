package com.qcksys.ao3tracker.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.BrowsingPreferences
import com.qcksys.ao3tracker.ui.navigation.NavigationState
import org.koin.compose.koinInject

class HiddenWorksScreen : Screen {
    @Composable
    override fun Content() {
        val settings = koinInject<AppSettings>()
        val repository = koinInject<Ao3Repository>()
        val navigator = LocalNavigator.currentOrThrow
        val preferences by settings.browsingPreferences.collectAsState()
        val works by remember(repository) { repository.getAllWorks() }.collectAsState(emptyList())
        HiddenWorksContent(
            preferences = preferences,
            knownTitles = works.mapNotNull { work -> work.title?.let { work.id to it } }.toMap(),
            onBack = { navigator.pop() },
            onOpen = NavigationState::navigateToWork,
            onUnhide = { settings.setWorkHidden(it, false) }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HiddenWorksContent(
    preferences: BrowsingPreferences,
    knownTitles: Map<Long, String>,
    onBack: () -> Unit,
    onOpen: (Long) -> Unit,
    onUnhide: (Long) -> Unit
) {
    var query by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val works = preferences.hiddenWorkIds.map { id ->
        id to (preferences.hiddenWorkTitles[id] ?: knownTitles[id] ?: "Work $id")
    }.filter { (id, title) -> title.contains(query.trim(), ignoreCase = true) || id.toString().contains(query.trim()) }
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Hidden works (${preferences.hiddenWorkIds.size})") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }
        )
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(query, { query = it }, label = { Text("Search hidden works") },
                placeholder = { Text("Title or work ID") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (works.isEmpty()) Text(if (preferences.hiddenWorkIds.isEmpty()) "No hidden works." else "No matching hidden works.")
            LazyColumn(Modifier.weight(1f)) {
                items(works, key = { it.first }) { (id, title) ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { onOpen(id) }, modifier = Modifier.weight(1f)) { Text(title, modifier = Modifier.fillMaxWidth()) }
                        TextButton(onClick = {
                            error = null
                            try { onUnhide(id) } catch (_: Exception) { error = "Could not unhide this work. Please try again." }
                        }, modifier = Modifier.semantics { contentDescription = "Unhide $title" }) { Text("Unhide") }
                    }
                }
            }
        }
    }
}
