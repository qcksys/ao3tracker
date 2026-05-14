package com.qcksys.ao3tracker.di

import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.auth.AuthService
import com.qcksys.ao3tracker.data.auth.getTokenStorage
import com.qcksys.ao3tracker.data.database.Ao3Database
import com.qcksys.ao3tracker.data.database.MIGRATION_1_2
import com.qcksys.ao3tracker.data.database.MIGRATION_2_3
import com.qcksys.ao3tracker.data.database.MIGRATION_3_4
import com.qcksys.ao3tracker.data.database.MIGRATION_4_5
import com.qcksys.ao3tracker.data.database.getDatabaseBuilder
import com.qcksys.ao3tracker.data.push.PushRepository
import com.qcksys.ao3tracker.data.push.PushTokenService
import com.qcksys.ao3tracker.data.push.getPushTokenStorage
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.data.settings.getSettingsStorage
import com.qcksys.ao3tracker.data.sync.SyncRepository
import com.qcksys.ao3tracker.data.sync.SyncService
import com.qcksys.ao3tracker.data.sync.SyncTriggers
import com.qcksys.ao3tracker.ui.screens.read.ReadScreenModel
import com.qcksys.ao3tracker.ui.screens.track.TrackScreenModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

val appModule = module {
    single<Ao3Database> {
        getDatabaseBuilder()
            .setDriver(BundledSQLiteDriver())
            .setQueryCoroutineContext(Dispatchers.IO)
            .addMigrations(
                MIGRATION_1_2,
                MIGRATION_2_3,
                MIGRATION_3_4,
                MIGRATION_4_5
            )
            .build()
    }

    singleOf(::Ao3Repository)

    // Settings
    single { getSettingsStorage() }
    single { AppSettings(get()) }

    // Favourite tag filters (Room-backed; synced via /api/track/sync's favouriteTags block)
    single { FavouriteTagRepository(get<Ao3Database>().favouriteTagDao()) }

    // Auth
    single { AuthService(get()) }
    single { getTokenStorage() }
    single { AuthRepository(get(), get()) }

    // Sync
    single { SyncService(get(), get()) }
    single { SyncRepository(get(), get(), get(), get(), get()) }
    // Eager so the debounce subscriber is wired before the first user action.
    single(createdAtStart = true) { SyncTriggers(get()) }

    // Push notifications
    single { getPushTokenStorage() }
    single { PushTokenService(get(), get()) }
    single { PushRepository(get(), get(), get()) }

    // ReadScreenModel as singleton to preserve state across tab switches
    singleOf(::ReadScreenModel)

    // TrackScreenModel as singleton to preserve filter state
    single { TrackScreenModel(get(), get(), get(), get()) }
}
