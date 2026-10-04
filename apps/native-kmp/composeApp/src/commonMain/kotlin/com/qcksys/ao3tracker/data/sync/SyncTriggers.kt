package com.qcksys.ao3tracker.data.sync

class SyncTriggers(private val coordinator: SyncCoordinator) {
    fun notifyReadingConnection() {
        coordinator.requestSync(showResult = false)
    }

    fun notifyFavouriteChanged() {
        coordinator.requestSync(showResult = false)
    }

    fun notifySavedSearchChanged() {
        coordinator.requestSync(showResult = false)
    }
}
