package com.qcksys.ao3tracker.ui.screens.settings

import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import com.qcksys.ao3tracker.data.model.ExportData
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class SettingsScreenModel(
    private val repository: Ao3Repository
) : ScreenModel {

    private val _workCount = MutableStateFlow(0)
    val workCount: StateFlow<Int> = _workCount.asStateFlow()

    private val _exportState = MutableStateFlow<ExportState>(ExportState.Idle)
    val exportState: StateFlow<ExportState> = _exportState.asStateFlow()

    private val json = Json {
        prettyPrint = true
        encodeDefaults = true
    }

    init {
        loadWorkCount()
    }

    private fun loadWorkCount() {
        screenModelScope.launch {
            repository.observeWorkCount().collect { _workCount.value = it }
        }
    }

    fun exportData(onExportReady: (String) -> Unit) {
        screenModelScope.launch {
            _exportState.value = ExportState.Loading
            try {
                val exportData = repository.getExportData()
                val jsonString = json.encodeToString(exportData)
                _exportState.value = ExportState.Success(jsonString)
                onExportReady(jsonString)
            } catch (e: Exception) {
                _exportState.value = ExportState.Error(e.message ?: "Export failed")
            }
        }
    }

    fun resetExportState() {
        _exportState.value = ExportState.Idle
    }

    fun deleteAllLocalData(onComplete: (Result<Unit>) -> Unit) {
        screenModelScope.launch {
            try {
                repository.deleteAllLocalData()
                _workCount.value = 0
                onComplete(Result.success(Unit))
            } catch (e: Exception) {
                onComplete(Result.failure(e))
            }
        }
    }
}

sealed class ExportState {
    data object Idle : ExportState()
    data object Loading : ExportState()
    data class Success(val data: String) : ExportState()
    data class Error(val message: String) : ExportState()
}
