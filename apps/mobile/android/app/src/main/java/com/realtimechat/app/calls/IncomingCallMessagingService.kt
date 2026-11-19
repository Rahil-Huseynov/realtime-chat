package com.realtimechat.app.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class IncomingCallMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) { super.onNewToken(token) }
  override fun onMessageReceived(message: RemoteMessage) {
    super.onMessageReceived(message)
    val d = message.data
    if (d["kind"] != "INCOMING_CALL") return
    val expires = d["expiresAt"]?.toLongOrNull() ?: 0L
    if (expires < System.currentTimeMillis()) return
    val callId = d["callId"] ?: return
    showIncoming(callId, d["callerName"] ?: "Naməlum istifadəçi", d["callType"] ?: "AUDIO")
  }
  private fun showIncoming(callId: String, caller: String, type: String) {
    val manager = getSystemService(NotificationManager::class.java)
    val channelId = "incoming_calls_v1"
    if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(channelId) == null) {
      manager.createNotificationChannel(NotificationChannel(channelId, "Gələn zənglər", NotificationManager.IMPORTANCE_HIGH).apply { description = "Audio və video zənglər"; lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC; setSound(android.provider.Settings.System.DEFAULT_RINGTONE_URI, android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build()); enableVibration(true) })
    }
    val full = Intent(this, IncomingCallActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP; putExtra("callId", callId); putExtra("callerName", caller); putExtra("callType", type) }
    val fullPi = PendingIntent.getActivity(this, callId.hashCode(), full, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val accept = PendingIntent.getActivity(this, callId.hashCode()+1, Intent(this, IncomingCallActivity::class.java).apply { flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP; putExtra("callId",callId);putExtra("callerName",caller);putExtra("callType",type);putExtra("autoAccept",true) }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val reject = PendingIntent.getActivity(this, callId.hashCode()+2, Intent(this, IncomingCallActivity::class.java).apply { flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP; putExtra("callId",callId);putExtra("reject",true);putExtra("callType",type);putExtra("callerName",caller) }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(this, channelId).setSmallIcon(android.R.drawable.sym_call_incoming).setContentTitle(caller).setContentText(if(type=="VIDEO") "Gələn video zəng" else "Gələn səsli zəng").setContentIntent(fullPi).setTimeoutAfter(45000).setCategory(NotificationCompat.CATEGORY_CALL).setPriority(NotificationCompat.PRIORITY_MAX).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setOngoing(true).setAutoCancel(false).setFullScreenIntent(fullPi,true).addAction(0,"Qəbul et",accept).addAction(0,"Rədd et",reject).build()
    try { NotificationManagerCompat.from(this).notify(callId.hashCode(),n) } catch (_: SecurityException) { }
  }
}
