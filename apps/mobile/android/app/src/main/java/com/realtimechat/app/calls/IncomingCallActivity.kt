package com.realtimechat.app.calls

import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.media.Ringtone
import android.media.RingtoneManager
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class IncomingCallActivity : Activity() {
  private var callId: String = ""
  private var callType: String = "AUDIO"
  private var callerName: String = ""
  private var ringtone: Ringtone? = null
  override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); if(Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true)};window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);render(intent) }
  override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); render(intent) }
  private fun render(i:Intent) {
    callId=i.getStringExtra("callId") ?: ""; callType=i.getStringExtra("callType") ?: "AUDIO"; callerName=i.getStringExtra("callerName") ?: "Naməlum istifadəçi"; val reject=i.getBooleanExtra("reject",false); val accept=i.getBooleanExtra("autoAccept",false)
    if(reject){openApp(false);return}
    if(ringtone==null){ringtone=RingtoneManager.getRingtone(this,RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));if(Build.VERSION.SDK_INT>=28)ringtone?.isLooping=true;ringtone?.play()}
    val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(32,64,32,64);setBackgroundColor(Color.rgb(13,22,40))}
    root.addView(TextView(this).apply{text=if(callType=="VIDEO")"Gələn video zəng" else "Gələn səsli zəng";textSize=19f;setTextColor(Color.LTGRAY);gravity=Gravity.CENTER})
    root.addView(TextView(this).apply{text=callerName;textSize=30f;setTextColor(Color.WHITE);gravity=Gravity.CENTER;setPadding(0,24,0,48)})
    val actions=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER}
    actions.addView(Button(this).apply{text="Rədd et";setOnClickListener{openApp(false)}})
    actions.addView(Button(this).apply{text="Qəbul et";setOnClickListener{openApp(true)}})
    root.addView(actions);setContentView(root)
    if(accept)openApp(true)
  }
  override fun onDestroy(){try{ringtone?.stop()}catch(_:Exception){};ringtone=null;super.onDestroy()}
  private fun openApp(accepted:Boolean){try{ringtone?.stop()}catch(_:Exception){};(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(callId.hashCode());val action=if(accepted)"accept" else "reject";val i=Intent(Intent.ACTION_VIEW,android.net.Uri.parse("realtimechat://call/$action?callId=$callId&type=${callType}&caller=${android.net.Uri.encode(callerName)}"));i.setPackage(packageName);i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP);startActivity(i);finish()}
}
