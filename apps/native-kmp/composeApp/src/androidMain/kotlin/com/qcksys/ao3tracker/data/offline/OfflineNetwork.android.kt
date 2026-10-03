package com.qcksys.ao3tracker.data.offline

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private val networkState = MutableStateFlow(OfflineNetwork(false, false))

fun initializeOfflineNetwork(context: Context) {
    val manager = context.getSystemService(ConnectivityManager::class.java)
    fun state(capabilities: NetworkCapabilities?) = OfflineNetwork(
        capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
        capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    )
    networkState.value = state(manager.getNetworkCapabilities(manager.activeNetwork))
    manager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            networkState.value = state(capabilities)
        }
        override fun onLost(network: Network) { networkState.value = OfflineNetwork(false, false) }
    })
}

internal actual fun offlineNetworkState(): StateFlow<OfflineNetwork> = networkState.asStateFlow()
