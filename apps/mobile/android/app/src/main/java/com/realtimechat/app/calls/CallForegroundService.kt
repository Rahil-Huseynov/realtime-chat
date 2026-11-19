package com.realtimechat.app.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class CallForegroundService : Service() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val video = intent?.getBooleanExtra("video", false) ?: false
    val channelId = "active_calls_v1"
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(channelId) == null) {
      manager.createNotificationChannel(NotificationChannel(channelId, "Aktiv zəng", NotificationManager.IMPORTANCE_LOW).apply { description = "Davam edən audio və video zəng" })
    }
    val notification = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(android.R.drawable.sym_call_incoming)
      .setContentTitle("Realtime Chat")
      .setContentText(if (video) "Video zəng davam edir" else "Səsli zəng davam edir")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
    if (Build.VERSION.SDK_INT >= 29) {
      var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      if (video && Build.VERSION.SDK_INT >= 30) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
      startForeground(41, notification, type)
    } else startForeground(41, notification)
    return START_NOT_STICKY
  }
  override fun onBind(intent: Intent?): IBinder? = null
}
