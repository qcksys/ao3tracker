package com.qcksys.ao3tracker.data.offline

import com.qcksys.ao3tracker.data.auth.AuthService
import com.qcksys.ao3tracker.data.auth.SyncAuthentication
import com.qcksys.ao3tracker.data.model.AuthState
import com.qcksys.ao3tracker.data.settings.AppSettings
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.HttpStatusCode
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable

/**
 * One chapter of `GET /api/backup/{workId}/offline`: a complete page in AO3's live chapter markup, from which the API has
 * already removed unsafe markup.
 */
@Serializable
internal data class OfflineBackupChapter(
    val id: String,
    val number: Int,
    val title: String,
    val html: String,
    val missingResources: List<String>
)

@Serializable
internal data class OfflineBackupStyle(val css: String, val media: String, val sourceUrl: String)

/**
 * The latest HTML backup of a work, rebuilt as chapter pages by the API, with AO3's default skins. The response's
 * deprecated `styles`, `preface` and `afterword` fields serve earlier app releases and are ignored.
 */
@Serializable
internal data class OfflineBackup(
    val workId: Long,
    val title: String,
    val ao3UpdatedAt: String?,
    val skins: List<OfflineBackupStyle>,
    val chapters: List<OfflineBackupChapter>
)

/** A failed backup download, with a message that can be shown to the reader. */
internal class OfflineBackupUnavailable(message: String) : Exception(message)

internal interface OfflineBackupSource {
    /** Whether a tracker account is signed in; backups are only served to accounts tracking the work. */
    val available: Flow<Boolean>

    /** Fetches the backup with the session of the tracker account [owner]. */
    suspend fun fetch(workId: Long, owner: String): OfflineBackup
}

internal class ApiOfflineBackupSource(
    private val settings: AppSettings,
    private val authService: AuthService,
    private val auth: SyncAuthentication
) : OfflineBackupSource {
    override val available: Flow<Boolean> = auth.authState.map { it is AuthState.Authenticated }

    override suspend fun fetch(workId: Long, owner: String): OfflineBackup {
        val token = backupSessionToken(auth, owner)
        try {
            val response = authService.getClient().get("${settings.getApiBaseUrl()}/backup/$workId/offline") {
                header("Authorization", "Bearer $token")
            }
            if (response.status.isSuccess()) return response.body()
            throw OfflineBackupUnavailable(when (response.status) {
                HttpStatusCode.Unauthorized -> "Sign in again to download backups."
                HttpStatusCode.Forbidden -> "Sync this work to your account before downloading its backup."
                HttpStatusCode.NotFound -> "No backup of this work is available yet."
                HttpStatusCode.UnprocessableEntity -> "This work's backup cannot be read offline yet."
                else -> "The backup could not be downloaded. Try again later."
            })
        } catch (error: CancellationException) {
            throw error
        } catch (error: OfflineBackupUnavailable) {
            throw error
        } catch (_: Exception) {
            throw OfflineBackupUnavailable("The backup could not be downloaded. Check your connection and try again.")
        }
    }
}

/**
 * The session token for the tracker account [owner]. A session restored while offline has no account until it is
 * validated, so it is validated first, as before a sync.
 */
internal suspend fun backupSessionToken(auth: SyncAuthentication, owner: String): String {
    if (auth.authState.value !is AuthState.Authenticated) throw OfflineBackupUnavailable("Sign in to download backups.")
    if (!auth.prepareSession()) {
        throw OfflineBackupUnavailable(
            if (auth.authState.value is AuthState.Authenticated) "Your session could not be checked. Check your connection and try again."
            else "Sign in again to download backups."
        )
    }
    val token = (auth.authState.value as? AuthState.Authenticated)?.token
    if (token == null || !auth.isCurrentSession(token, owner)) throw OfflineBackupUnavailable("Sign in to download backups.")
    return token
}

/**
 * Saved-chapter pages for a backup, in the same form as captured AO3 chapters. AO3's default skins are the pages'
 * skin, used only while no AO3 site skin has been captured for the AO3 account.
 */
internal fun offlineBackupPages(backup: OfflineBackup, identity: String): List<OfflinePage> {
    val workId = backup.workId.toString()
    fun url(chapter: OfflineBackupChapter) =
        if (chapter.id == "0") "https://archiveofourown.org/works/$workId"
        else "https://archiveofourown.org/works/$workId/chapters/${chapter.id}"
    val manifest = backup.chapters.map { OfflineChapter(it.id, it.number, it.title, url(it)) }
    val styles = backup.skins.map { OfflineStyle(it.css, it.sourceUrl, it.media, false) }
    return backup.chapters.map { chapter ->
        // The reader inserts its content policy and styles into the document head.
        require(Regex("<head(\\s[^>]*)?>").containsMatchIn(chapter.html)) { "The backup chapter has no document head." }
        OfflinePage(1, url(chapter), workId, chapter.id, "chapter", backup.title, identity, canSelectSkin = false,
            html = chapter.html, siteStyles = styles, chapters = manifest, downloadUpdatedAt = backup.ao3UpdatedAt)
    }
}
