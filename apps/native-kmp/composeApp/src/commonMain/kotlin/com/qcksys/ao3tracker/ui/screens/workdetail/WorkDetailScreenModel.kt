package com.qcksys.ao3tracker.ui.screens.workdetail

import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import com.qcksys.ao3tracker.data.model.Work
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class WorkDetailScreenModel(
    private val workId: Long,
    private val repository: Ao3Repository
) : ScreenModel {

    val work: StateFlow<Work?> = repository.getWorkById(workId)
        .stateIn(
            scope = screenModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = null
        )

    private val _navigateToChapter = MutableStateFlow<NavigationEvent?>(null)
    val navigateToChapter: StateFlow<NavigationEvent?> = _navigateToChapter

    fun onChapterClick(chapterId: Long, scrollPosition: Float) {
        screenModelScope.launch {
            val work = work.value ?: return@launch
            val chapter = work.chapterList.find { it.id == chapterId }
            if (chapter != null) {
                val url = buildChapterUrl(work.id, chapter.id, scrollPosition)
                _navigateToChapter.value = NavigationEvent(url)
            }
        }
    }

    fun onWorkClick() {
        screenModelScope.launch {
            val work = work.value ?: return@launch
            _navigateToChapter.value = NavigationEvent("https://archiveofourown.org/works/${work.id}")
        }
    }

    fun clearNavigationEvent() {
        _navigateToChapter.value = null
    }

    fun deleteChapter(chapterId: Long) {
        screenModelScope.launch {
            repository.deleteChapter(chapterId, workId)
        }
    }

    fun deleteWork() {
        screenModelScope.launch {
            repository.deleteWork(workId)
        }
    }

    fun markChapterAsRead(chapterId: Long) {
        screenModelScope.launch {
            repository.markChapterAsRead(chapterId, workId)
        }
    }

    fun markWorkAsRead() {
        screenModelScope.launch {
            repository.markWorkAsRead(workId)
        }
    }

    fun markChapterAsUnread(chapterId: Long) {
        screenModelScope.launch {
            repository.markChapterAsUnread(chapterId, workId)
        }
    }

    fun markWorkAsUnread() {
        screenModelScope.launch {
            repository.markWorkAsUnread(workId)
        }
    }

    /**
     * Toggles the subscription status for push notifications on this work.
     */
    fun toggleSubscription() {
        screenModelScope.launch {
            val currentWork = work.value ?: return@launch
            repository.updateWorkSubscription(workId, !currentWork.subscribed)
        }
    }

    /**
     * Toggles the favourite status for this work.
     */
    fun toggleFavourite() {
        screenModelScope.launch {
            val currentWork = work.value ?: return@launch
            repository.updateWorkFavourite(workId, !currentWork.favourite)
        }
    }

    private fun buildChapterUrl(workId: Long, chapterId: Long, scrollPosition: Float): String {
        // chapterId = 0 is used for single-chapter works, use work URL instead
        val baseUrl = if (chapterId == 0L) {
            "https://archiveofourown.org/works/$workId"
        } else {
            "https://archiveofourown.org/works/$workId/chapters/$chapterId"
        }
        return if (scrollPosition > 0) {
            val scrollPercent = (scrollPosition * 100).toInt()
            "$baseUrl?scrollTo=$scrollPercent"
        } else {
            baseUrl
        }
    }
}

data class NavigationEvent(val url: String)
