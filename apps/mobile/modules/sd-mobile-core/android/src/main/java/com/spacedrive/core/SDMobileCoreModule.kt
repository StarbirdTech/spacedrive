package com.spacedrive.core

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// Options class for folder picker (required for AsyncFunction pattern with activity results)
class FolderPickerOptions : Record {
    @Field
    val dummy: String? = null
}

class SDMobileCoreModule : Module() {
    private var listeners = 0
    private var logListeners = 0
    private var registeredWithRust = false
    private var logRegisteredWithRust = false
    private var pendingFolderPickerPromise: Promise? = null

    companion object {
        private const val FOLDER_PICKER_REQUEST_CODE = 9999
    }

    init {
        try {
            System.loadLibrary("sd_mobile_core")
        } catch (e: UnsatisfiedLinkError) {
            android.util.Log.e("SDMobileCore", "Failed to load native library: ${e.message}")
        }
    }

    override fun definition() = ModuleDefinition {
        Name("SDMobileCore")

        Events("SDCoreEvent", "SDCoreLog")

        OnStartObserving("SDCoreEvent") {
            android.util.Log.i("SDMobileCore", "📡 OnStartObserving SDCoreEvent triggered")

            if (!registeredWithRust) {
                try {
                    android.util.Log.i("SDMobileCore", "🚀 Registering event listener...")
                    registerCoreEventListener()
                    registeredWithRust = true
                    android.util.Log.i("SDMobileCore", "✅ Event listener registered with Rust")
                } catch (e: Exception) {
                    android.util.Log.e("SDMobileCore", "Failed to register event listener: ${e.message}")
                }
            }

            listeners++
            android.util.Log.i("SDMobileCore", "📊 SDCoreEvent listeners: $listeners")
        }

        OnStopObserving("SDCoreEvent") {
            listeners--
            android.util.Log.i("SDMobileCore", "📉 SDCoreEvent listeners: $listeners")
        }

        OnStartObserving("SDCoreLog") {
            android.util.Log.i("SDMobileCore", "📡 OnStartObserving SDCoreLog triggered")

            if (!logRegisteredWithRust) {
                try {
                    android.util.Log.i("SDMobileCore", "🚀 Registering log listener...")
                    registerCoreLogListener()
                    logRegisteredWithRust = true
                    android.util.Log.i("SDMobileCore", "✅ Log listener registered with Rust")
                } catch (e: Exception) {
                    android.util.Log.e("SDMobileCore", "Failed to register log listener: ${e.message}")
                }
            }

            logListeners++
            android.util.Log.i("SDMobileCore", "📊 SDCoreLog listeners: $logListeners")
        }

        OnStopObserving("SDCoreLog") {
            logListeners--
            android.util.Log.i("SDMobileCore", "📉 SDCoreLog listeners: $logListeners")
        }

        Function("initialize") { dataDir: String?, deviceName: String? ->
            val dir = dataDir ?: appContext.persistentFilesDirectory?.absolutePath
                ?: throw Exception("No data directory available")

            try {
                initializeCore(dir, deviceName)
            } catch (e: Exception) {
                android.util.Log.e("SDMobileCore", "Failed to initialize core: ${e.message}")
                -1
            }
        }

        AsyncFunction("sendMessage") { query: String, promise: Promise ->
            try {
                handleCoreMsg(query, SDCorePromise(promise))
            } catch (e: Exception) {
                promise.reject("CORE_ERROR", e.message ?: "Unknown error", e)
            }
        }

        Function("shutdown") {
            try {
                shutdownCore()
            } catch (e: Exception) {
                android.util.Log.e("SDMobileCore", "Failed to shutdown core: ${e.message}")
            }
        }

        // Simple test function
        Function("testFunction") {
            android.util.Log.i("SDMobileCore", "testFunction called!")
            "test_result"
        }

        // Open Android folder picker using Storage Access Framework
        AsyncFunction("pickFolder") { options: FolderPickerOptions, promise: Promise ->
            val activity = appContext.currentActivity
            if (activity == null) {
                promise.reject(CodedException("NO_ACTIVITY", "No activity available", null))
                return@AsyncFunction
            }

            try {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
                    addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
                }

                pendingFolderPickerPromise = promise
                activity.startActivityForResult(intent, FOLDER_PICKER_REQUEST_CODE)
            } catch (e: Exception) {
                android.util.Log.e("SDMobileCore", "Failed to open folder picker: ${e.message}")
                promise.reject(CodedException("PICKER_ERROR", e.message ?: "Failed to open folder picker", e))
            }
        }

        // Get the real filesystem path from a content URI (if possible)
        Function("getPathFromUri") { uriString: String ->
            try {
                val uri = Uri.parse(uriString)
                getPathFromContentUri(uri)
            } catch (e: Exception) {
                android.util.Log.e("SDMobileCore", "Failed to get path from URI: ${e.message}")
                null
            }
        }

        OnActivityResult { _, payload ->
            if (payload.requestCode == FOLDER_PICKER_REQUEST_CODE) {
                val promise = pendingFolderPickerPromise
                pendingFolderPickerPromise = null

                if (promise == null) {
                    android.util.Log.w("SDMobileCore", "No pending promise for folder picker result")
                    return@OnActivityResult
                }

                if (payload.resultCode != Activity.RESULT_OK) {
                    promise.reject(CodedException("CANCELLED", "Folder picker was cancelled", null))
                    return@OnActivityResult
                }

                val uri = payload.data?.data
                if (uri == null) {
                    promise.reject(CodedException("NO_URI", "No folder URI returned", null))
                    return@OnActivityResult
                }

                // Take persistent permissions
                try {
                    val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    appContext.reactContext?.contentResolver?.takePersistableUriPermission(uri, takeFlags)
                } catch (e: Exception) {
                    android.util.Log.w("SDMobileCore", "Failed to take persistent permission: ${e.message}")
                }

                // Try to get the real path
                val realPath = getPathFromContentUri(uri)
                val folderName = appContext.reactContext?.let { context ->
                    DocumentFile.fromTreeUri(context, uri)?.name
                } ?: "Unknown"

                val result = mapOf(
                    "uri" to uri.toString(),
                    "path" to realPath,
                    "name" to folderName
                )

                promise.resolve(result)
            }
        }
    }

    fun getDataDirectory(): String {
        return appContext.persistentFilesDirectory?.absolutePath ?: ""
    }

    fun sendCoreEvent(body: String) {
        if (listeners > 0) {
            this@SDMobileCoreModule.sendEvent("SDCoreEvent", mapOf("body" to body))
        }
    }

    fun sendCoreLog(body: String) {
        if (logListeners > 0) {
            this@SDMobileCoreModule.sendEvent("SDCoreLog", mapOf("body" to body))
        }
    }

    /**
     * Attempts to convert a content:// URI to a real filesystem path.
     * This works for primary external storage on most devices.
     */
    private fun getPathFromContentUri(uri: Uri): String? {
        // Handle document tree URIs (from ACTION_OPEN_DOCUMENT_TREE)
        if (DocumentsContract.isTreeUri(uri)) {
            val docId = DocumentsContract.getTreeDocumentId(uri)
            return getPathFromDocId(docId)
        }

        // Handle regular document URIs
        if (DocumentsContract.isDocumentUri(appContext.reactContext, uri)) {
            val docId = DocumentsContract.getDocumentId(uri)
            return getPathFromDocId(docId)
        }

        return null
    }

    private fun getPathFromDocId(docId: String): String? {
        // Validate document ID is not empty
        if (docId.isBlank()) {
            Log.w("SDMobileCore", "Empty document ID provided")
            return null
        }

        // Document ID format: "primary:path/to/folder" or "storageId:path/to/folder"
        // Use limit=2 to handle paths that contain colons (e.g., "primary:path/with:colon/folder")
        val split = docId.split(":", limit = 2)
        if (split.size < 2) {
            Log.w("SDMobileCore", "Invalid document ID format: $docId")
            return null
        }

        val storageId = split[0]
        val relativePath = split[1]

        // Security: Validate path for traversal attacks
        if (relativePath.contains("..") || relativePath.startsWith("/")) {
            Log.w("SDMobileCore", "Suspicious path in document ID rejected: $relativePath")
            return null
        }

        return when (storageId) {
            "primary" -> {
                // Primary external storage
                @Suppress("DEPRECATION")
                val basePath = Environment.getExternalStorageDirectory().absolutePath
                if (relativePath.isNotEmpty()) "$basePath/$relativePath" else basePath
            }
            "home" -> {
                // Home directory (Documents folder on some devices)
                @Suppress("DEPRECATION")
                val basePath = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS).absolutePath
                if (relativePath.isNotEmpty()) "$basePath/$relativePath" else basePath
            }
            else -> {
                // Other storage volumes (SD cards, USB drives)
                // Try StorageManager API first on Android N+
                val resolvedPath = tryResolveViaStorageManager(storageId, relativePath)
                if (resolvedPath != null) {
                    return resolvedPath
                }

                // Fallback: Try common mount points
                val possiblePaths = listOf(
                    "/storage/$storageId",
                    "/mnt/media_rw/$storageId",
                    "/mnt/usb/$storageId"
                ).map { base ->
                    if (relativePath.isNotEmpty()) "$base/$relativePath" else base
                }

                val foundPath = possiblePaths.firstOrNull { java.io.File(it).exists() }
                if (foundPath == null) {
                    Log.w("SDMobileCore", "Could not resolve path for storage ID: $storageId, tried: $possiblePaths")
                }
                foundPath
            }
        }
    }

    /**
     * Try to resolve a storage volume path using StorageManager API (Android N+).
     * This provides more reliable path resolution than hardcoded mount points.
     */
    private fun tryResolveViaStorageManager(storageId: String, relativePath: String): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return null
        }

        val context = appContext.reactContext ?: return null
        val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as? StorageManager
            ?: return null

        try {
            @Suppress("DEPRECATION")
            val volumes = storageManager.storageVolumes
            for (volume in volumes) {
                // Try to match by UUID
                val uuid = volume.uuid
                if (uuid != null && uuid.equals(storageId, ignoreCase = true)) {
                    // On Android R+, we can get the directory directly
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        val directory = volume.directory
                        if (directory != null) {
                            val basePath = directory.absolutePath
                            return if (relativePath.isNotEmpty()) "$basePath/$relativePath" else basePath
                        }
                    }
                    // Fallback: construct path from common patterns
                    val possibleBase = "/storage/$uuid"
                    if (java.io.File(possibleBase).exists()) {
                        return if (relativePath.isNotEmpty()) "$possibleBase/$relativePath" else possibleBase
                    }
                }
            }
        } catch (e: Exception) {
            Log.w("SDMobileCore", "StorageManager resolution failed: ${e.message}")
        }

        return null
    }

    // Native methods - will throw UnsatisfiedLinkError if library not loaded
    private external fun registerCoreEventListener()
    private external fun registerCoreLogListener()
    private external fun initializeCore(dataDir: String, deviceName: String?): Int
    private external fun handleCoreMsg(query: String, promise: SDCorePromise)
    private external fun shutdownCore()
}

class SDCorePromise(private val promise: Promise) {
    fun resolve(msg: String) {
        promise.resolve(msg)
    }

    fun reject(error: String) {
        promise.reject("CORE_ERROR", error, null)
    }
}
