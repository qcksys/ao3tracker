package com.qcksys.ao3tracker.di

import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.qcksys.ao3tracker.data.auth.AuthRepository
import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.auth.SessionTokenStorage
import com.qcksys.ao3tracker.data.auth.AuthService
import com.qcksys.ao3tracker.data.auth.getTokenStorage
import com.qcksys.ao3tracker.data.database.DB_FILE_NAME
import com.qcksys.ao3tracker.data.database.AccountDataStore
import com.qcksys.ao3tracker.data.database.MIGRATION_7_8
import com.qcksys.ao3tracker.data.database.MIGRATION_8_9
import com.qcksys.ao3tracker.data.database.MIGRATION_6_7
import com.qcksys.ao3tracker.data.database.MIGRATION_1_2
import com.qcksys.ao3tracker.data.database.MIGRATION_2_3
import com.qcksys.ao3tracker.data.database.MIGRATION_3_4
import com.qcksys.ao3tracker.data.database.MIGRATION_4_5
import com.qcksys.ao3tracker.data.database.MIGRATION_5_6
import com.qcksys.ao3tracker.data.database.getDatabaseBuilder
import com.qcksys.ao3tracker.data.push.PushRepository
import com.qcksys.ao3tracker.data.push.PushTokenService
import com.qcksys.ao3tracker.data.push.getPushTokenStorage
import com.qcksys.ao3tracker.data.push.PushTokenStore
import com.qcksys.ao3tracker.data.repository.Ao3Repository
import com.qcksys.ao3tracker.data.repository.FavouriteTagRepository
import com.qcksys.ao3tracker.data.repository.SavedSearchRepository
import com.qcksys.ao3tracker.data.repository.SearchCheckRepository
import com.qcksys.ao3tracker.data.settings.AppSettings
import com.qcksys.ao3tracker.diagnostics.Diagnostics
import com.qcksys.ao3tracker.diagnostics.DiagnosticsClient
import com.qcksys.ao3tracker.diagnostics.DiagnosticsTransport
import com.qcksys.ao3tracker.data.settings.getSettingsStorage
import com.qcksys.ao3tracker.data.sync.SyncRepository
import com.qcksys.ao3tracker.data.sync.SyncCoordinator
import com.qcksys.ao3tracker.data.sync.SyncService
import com.qcksys.ao3tracker.data.sync.SyncRemote
import com.qcksys.ao3tracker.data.sync.SyncTriggers
import com.qcksys.ao3tracker.ui.screens.read.ReadScreenModel
import com.qcksys.ao3tracker.ui.screens.searches.SearchesScreenModel
import com.qcksys.ao3tracker.ui.screens.track.TrackScreenModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

val appModule = module {
    single {
        val openDatabase = { fileName: String ->
            getDatabaseBuilder(fileName)
                .setDriver(BundledSQLiteDriver())
                .setQueryCoroutineContext(Dispatchers.IO)
                .addMigrations(
                    MIGRATION_1_2,
                    MIGRATION_2_3,
                    MIGRATION_3_4,
                    MIGRATION_4_5,
                    MIGRATION_5_6,
                    MIGRATION_6_7,
                    MIGRATION_7_8,
                    MIGRATION_8_9
                )
                .build()
        }
        AccountDataStore(openDatabase(DB_FILE_NAME), openDatabase)
    }

    single { Ao3Repository(get()) }

    // Settings
    single { getSettingsStorage() }
    single { AppSettings(get()) }
    single { DiagnosticsTransport() }
    single(createdAtStart = true) {
        DiagnosticsClient(get(), get<PushTokenStore>().getPlatform(), get<DiagnosticsTransport>()::send)
            .also(Diagnostics::install)
    }

    // Favourite tag filters (Room-backed; synced via /api/track/sync's favouriteTags block)
    single { FavouriteTagRepository(get<AccountDataStore>()) }

    // Saved searches (Room-backed; synced via /api/track/sync's savedSearches block)
    single { SavedSearchRepository(get<AccountDataStore>()) }
    single { SearchCheckRepository(get()) }

    // Auth
    single { AuthService(get()) }
    single<SessionTokenStorage> { getTokenStorage() }
    single { AuthRepository(get(), get(), get(), get()) }
    single<SyncAuthentication> { get<AuthRepository>() }

    // Sync
    single<SyncRemote> { SyncService(get(), get()) }
    single { SyncRepository(get(), get(), get(), get(), get()) }
    single {
        val auth = get<AuthRepository>()
        val push = get<PushRepository>()
        SyncCoordinator(get(), auth, get(), signOut = { isCurrentSession ->
            push.unregisterToken(isCurrentSession)
            auth.signOut(isCurrentSession)
        })
    }
    single { SyncTriggers(get()) }

    // Push notifications
    single<PushTokenStore> { getPushTokenStorage() }
    single { PushTokenService(get(), get()) }
    single { PushRepository(get(), get(), get(), get()) }

    // ReadScreenModel as singleton to preserve state across tab switches
    singleOf(::ReadScreenModel)

    // TrackScreenModel as singleton to preserve filter state
    single { TrackScreenModel(get(), get(), get(), get()) }
    singleOf(::SearchesScreenModel)
}
