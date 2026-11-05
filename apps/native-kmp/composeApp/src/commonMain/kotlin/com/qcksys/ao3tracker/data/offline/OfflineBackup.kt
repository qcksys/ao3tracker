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

/** One chapter of `GET /api/backup/{workId}/offline`; the API has already removed unsafe markup. */
@Serializable
internal data class OfflineBackupChapter(
    val id: String,
    val number: Int,
    val title: String,
    val html: String,
    val missingResources: List<String>
)

/** The latest HTML backup of a work, split into chapters by the API. */
@Serializable
internal data class OfflineBackup(
    val workId: Long,
    val title: String,
    val ao3UpdatedAt: String?,
    val styles: String,
    val preface: String,
    val afterword: String,
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
        val token = (auth.authState.value as? AuthState.Authenticated)?.token
        if (token == null || !auth.isCurrentSession(token, owner)) throw OfflineBackupUnavailable("Sign in to download backups.")
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
 * Saved-chapter pages for a backup, in the same form as captured AO3 chapters. The download's own CSS is the
 * pages' skin, used only while no AO3 site skin has been captured for the AO3 account.
 */
internal fun offlineBackupPages(backup: OfflineBackup, identity: String): List<OfflinePage> {
    val workId = backup.workId.toString()
    fun url(chapter: OfflineBackupChapter) =
        if (chapter.id == "0") "https://archiveofourown.org/works/$workId"
        else "https://archiveofourown.org/works/$workId/chapters/${chapter.id}"
    val manifest = backup.chapters.map { OfflineChapter(it.id, it.number, it.title, url(it)) }
    val styles = listOfNotNull(backup.styles.takeIf { it.isNotBlank() }
        ?.let { OfflineStyle(it, "https://archiveofourown.org/works/$workId", "all", false) })
    return backup.chapters.mapIndexed { index, chapter ->
        OfflinePage(1, url(chapter), workId, chapter.id, "chapter", backup.title, identity, canSelectSkin = false,
            html = backupChapterDocument(backup, index), siteStyles = styles, chapters = manifest,
            downloadUpdatedAt = backup.ao3UpdatedAt)
    }
}

/** An AO3-shaped chapter page, so a captured site skin styles it like a live chapter. */
private fun backupChapterDocument(backup: OfflineBackup, index: Int): String {
    val chapter = backup.chapters[index]
    val title = backup.title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    val preface = if (index == 0 && backup.preface.isNotBlank()) backup.preface else "<h2 class=\"title heading\">$title</h2>"
    val afterword = if (index == backup.chapters.lastIndex && backup.afterword.isNotBlank())
        "<div id=\"afterword\" class=\"preface group\">${backup.afterword}</div>" else ""
    return "<html lang=\"en\"><head><meta charset=\"utf-8\">" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>$title</title></head>" +
        "<body><div id=\"outer\" class=\"wrapper\"><div id=\"inner\" class=\"wrapper\">" +
        "<div id=\"main\" class=\"works-show region\" role=\"main\"><div id=\"workskin\">" +
        "<div class=\"preface group\">$preface</div>" +
        "<div id=\"chapters\" role=\"article\"><div class=\"chapter\" id=\"chapter-${chapter.number}\">${chapter.html}</div></div>" +
        afterword +
        "</div></div></div></div></body></html>"
}
