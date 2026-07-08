package expo.modules.notecam

import android.app.Activity
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions
import java.io.File
import java.io.FileOutputStream

class NotecamModule : Module() {
  private var pendingPromise: Promise? = null
  private var currentPhotoFile: File? = null

  private val REQUEST_CODE_CAMERA = 9876

  override fun definition() = ModuleDefinition {
    Name("NotecamModule")

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE_CAMERA) return@OnActivityResult

      val promise = pendingPromise
      pendingPromise = null

      if (payload.resultCode == Activity.RESULT_OK) {
        val file = currentPhotoFile

        // Caminho 1: app de câmera honrou o EXTRA_OUTPUT → arquivo foi salvo na URI esperada
        if (file != null && file.exists() && file.length() > 0) {
          currentPhotoFile = null
          promise?.resolve("file://${file.absolutePath}")
          return@OnActivityResult
        }

        // Caminho 2: câmera ignorou o EXTRA_OUTPUT (ex.: NoteCam com marca d'água) →
        // lê a foto mais recente salva no MediaStore (galeria).
        val context = appContext.reactContext
        if (context != null) {
          val uri = getLatestMediaStoreImage(context)
          if (uri != null) {
            currentPhotoFile = null
            promise?.resolve(uri.toString())
            return@OnActivityResult
          }
        }

        currentPhotoFile = null
        promise?.reject("EMPTY_FILE", "Image file is empty or not found", null)
      } else {
        currentPhotoFile = null
        promise?.reject("CANCELED", "User canceled or capture failed", null)
      }
    }

    AsyncFunction("takePhotoAsync") { promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()

      // Cria um arquivo temporário para receber a foto via EXTRA_OUTPUT
      val tempFile = try {
        File.createTempFile("notecam_", ".jpg", context.cacheDir)
      } catch (e: Exception) {
        promise.reject("FILE_ERROR", "Could not create temporary file", e)
        return@AsyncFunction
      }

      // Gera a content URI via FileProvider (necessária para EXTRA_OUTPUT no Android 7+)
      val authority = "${context.packageName}.NotecamFileProvider"
      val photoUri: Uri = try {
        FileProvider.getUriForFile(context, authority, tempFile)
      } catch (e: Exception) {
        promise.reject("PROVIDER_ERROR", "Failed to get URI from FileProvider", e)
        return@AsyncFunction
      }

      // Intent implícito: o Android exibe o seletor nativo de apps de câmera.
      // Nenhum setPackage() — o usuário escolhe qual app usar e pode marcar "Sempre".
      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
        putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      // Garante que há pelo menos um app de câmera instalado antes de disparar
      if (intent.resolveActivity(context.packageManager) == null) {
        promise.reject("NO_CAMERA_APP", "No camera app found on this device", null)
        return@AsyncFunction
      }

      pendingPromise = promise
      currentPhotoFile = tempFile

      try {
        activity.startActivityForResult(intent, REQUEST_CODE_CAMERA)
      } catch (e: Exception) {
        pendingPromise = null
        currentPhotoFile = null
        promise.reject("START_FAILED", "Failed to start camera activity", e)
      }
    }
  }

  /**
   * Fallback: busca a imagem mais recente do MediaStore, copia pro cache do app e
   * retorna uma URI file://.
   *
   * Retornar content:// diretamente não funciona com expo-image-manipulator em
   * todos os dispositivos Android — copiar para cache garante compatibilidade.
   */
  private fun getLatestMediaStoreImage(context: Context): Uri? {
    val projection = arrayOf(MediaStore.Images.Media._ID)
    val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

    val contentUri = try {
      context.contentResolver.query(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        projection,
        null,
        null,
        sortOrder
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
          ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        } else null
      }
    } catch (e: Exception) {
      null
    } ?: return null

    // Copia o conteúdo para um arquivo temporário no cache e retorna file://
    return try {
      val destFile = File.createTempFile("notecam_fallback_", ".jpg", context.cacheDir)
      context.contentResolver.openInputStream(contentUri)?.use { input ->
        FileOutputStream(destFile).use { output ->
          input.copyTo(output)
        }
      }
      if (destFile.exists() && destFile.length() > 0) {
        Uri.fromFile(destFile)
      } else null
    } catch (e: Exception) {
      null
    }
  }
}
