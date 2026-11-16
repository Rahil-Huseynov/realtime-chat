package expo.modules.callpush

import com.google.firebase.messaging.FirebaseMessaging
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class CallPushModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallPush")
    AsyncFunction("canUseFullScreenIntent") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (Build.VERSION.SDK_INT < 34) true else context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    }
    AsyncFunction("openFullScreenIntentSettings") {
      val context = appContext.reactContext ?: return@AsyncFunction
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }
    AsyncFunction("startCallService") { type: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val intent = Intent(context, com.realtimechat.app.calls.CallForegroundService::class.java)
      intent.putExtra("video", type == "VIDEO")
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
    }
    AsyncFunction("stopCallService") {
      val context = appContext.reactContext ?: return@AsyncFunction
      context.stopService(Intent(context, com.realtimechat.app.calls.CallForegroundService::class.java))
    }
    AsyncFunction("getToken") { promise: Promise ->
      FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
        if (task.isSuccessful) promise.resolve(task.result)
        else promise.reject("FCM_TOKEN_ERROR", "FCM token alınmadı", task.exception)
      }
    }
  }
}
