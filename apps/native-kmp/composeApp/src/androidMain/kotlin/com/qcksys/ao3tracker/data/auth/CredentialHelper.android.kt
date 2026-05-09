package com.qcksys.ao3tracker.data.auth

import android.app.Activity
import android.content.Context
import androidx.credentials.CreatePasswordRequest
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPasswordOption
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PasswordCredential as AndroidPasswordCredential
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.qcksys.ao3tracker.util.AppLogger
import java.lang.ref.WeakReference

private const val TAG = "CredentialHelper"

class AndroidCredentialHelper(
    context: Context
) : CredentialHelper {
    private val credentialManager = CredentialManager.create(context)
    private var activityRef: WeakReference<Activity>? = null

    fun setActivity(activity: Activity?) {
        activityRef = activity?.let { WeakReference(it) }
    }

    private fun getActivity(): Activity? = activityRef?.get()

    override fun isSupported(): Boolean = true

    override suspend fun getCredential(
        passkeyRequestJson: String?
    ): CredentialResult {
        val activity = getActivity() ?: return CredentialResult.Error("No activity available")

        val requestBuilder = GetCredentialRequest.Builder()
            .addCredentialOption(GetPasswordOption())

        if (passkeyRequestJson != null) {
            requestBuilder.addCredentialOption(
                GetPublicKeyCredentialOption(passkeyRequestJson)
            )
        }

        return try {
            val result = credentialManager.getCredential(
                context = activity,
                request = requestBuilder.build()
            )

            when (val credential = result.credential) {
                is AndroidPasswordCredential -> {
                    CredentialResult.Password(
                        PasswordCredential(
                            email = credential.id,
                            password = credential.password
                        )
                    )
                }
                is PublicKeyCredential -> {
                    CredentialResult.Passkey(
                        PasskeyCredential(
                            responseJson = credential.authenticationResponseJson
                        )
                    )
                }
                else -> {
                    CredentialResult.Error("Unknown credential type")
                }
            }
        } catch (e: GetCredentialCancellationException) {
            CredentialResult.Cancelled
        } catch (e: NoCredentialException) {
            CredentialResult.Error("No saved credentials found")
        } catch (e: GetCredentialException) {
            CredentialResult.Error(e.message ?: "Failed to get credential")
        } catch (e: Exception) {
            CredentialResult.Error(e.message ?: "Unknown error")
        }
    }

    override suspend fun savePassword(
        email: String,
        password: String
    ): SaveCredentialResult {
        val activity = getActivity() ?: run {
            AppLogger.e("savePassword: No activity available", TAG)
            return SaveCredentialResult.Error("No activity available")
        }

        return try {
            AppLogger.d("savePassword: Attempting to save password for $email", TAG)
            credentialManager.createCredential(
                context = activity,
                request = CreatePasswordRequest(
                    id = email,
                    password = password
                )
            )
            AppLogger.d("savePassword: Password saved successfully", TAG)
            SaveCredentialResult.Success
        } catch (e: CreateCredentialCancellationException) {
            AppLogger.d("savePassword: User cancelled", TAG)
            SaveCredentialResult.Success // User cancelled, but that's OK
        } catch (e: CreateCredentialNoCreateOptionException) {
            // No password provider configured on device (e.g., Google Password Manager disabled)
            AppLogger.w("savePassword: No credential provider available on device", TAG)
            SaveCredentialResult.NoProviderAvailable
        } catch (e: CreateCredentialException) {
            AppLogger.e("savePassword: CreateCredentialException - type: ${e.type}, message: ${e.message}", TAG, e)
            SaveCredentialResult.Error(e.message ?: "Failed to save password")
        } catch (e: Exception) {
            AppLogger.e("savePassword: Unknown error", TAG, e)
            SaveCredentialResult.Error(e.message ?: "Unknown error")
        }
    }

    override suspend fun createPasskey(
        requestJson: String
    ): CredentialResult {
        val activity = getActivity() ?: run {
            AppLogger.e("createPasskey: No activity available", TAG)
            return CredentialResult.Error("No activity available")
        }

        return try {
            AppLogger.d("createPasskey: Starting passkey creation", TAG)
            val result = credentialManager.createCredential(
                context = activity,
                request = CreatePublicKeyCredentialRequest(requestJson)
            )

            when (result) {
                is androidx.credentials.CreatePublicKeyCredentialResponse -> {
                    AppLogger.d("createPasskey: Passkey created successfully", TAG)
                    CredentialResult.Passkey(
                        PasskeyCredential(
                            responseJson = result.registrationResponseJson
                        )
                    )
                }
                else -> {
                    AppLogger.e("createPasskey: Unexpected response type: ${result::class.simpleName}", TAG)
                    CredentialResult.Error("Unexpected response type")
                }
            }
        } catch (e: CreateCredentialCancellationException) {
            AppLogger.d("createPasskey: User cancelled", TAG)
            CredentialResult.Cancelled
        } catch (e: CreateCredentialException) {
            AppLogger.e("createPasskey: CreateCredentialException - type: ${e.type}, message: ${e.message}", TAG, e)
            CredentialResult.Error(e.message ?: "Failed to create passkey")
        } catch (e: Exception) {
            AppLogger.e("createPasskey: Unknown error", TAG, e)
            CredentialResult.Error(e.message ?: "Unknown error")
        }
    }
}

private var credentialHelperInstance: AndroidCredentialHelper? = null

fun initializeCredentialHelper(context: Context): AndroidCredentialHelper {
    return credentialHelperInstance ?: AndroidCredentialHelper(context).also {
        credentialHelperInstance = it
    }
}

fun getAndroidCredentialHelper(): AndroidCredentialHelper? = credentialHelperInstance

actual fun createCredentialHelper(): CredentialHelper? = credentialHelperInstance
