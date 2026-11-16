const { withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs'); const path = require('path');
module.exports = function withAndroidCall(config) {
  config = withAndroidManifest(config, c => {
    const m = c.modResults.manifest; const app = m.application[0];
    m.$ = { ...m.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
    const uses = m['uses-permission'] || (m['uses-permission'] = []);
    ['android.permission.POST_NOTIFICATIONS','android.permission.USE_FULL_SCREEN_INTENT','android.permission.VIBRATE','android.permission.WAKE_LOCK','android.permission.CAMERA','android.permission.RECORD_AUDIO','android.permission.MODIFY_AUDIO_SETTINGS','android.permission.ACCESS_NETWORK_STATE','android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_MICROPHONE','android.permission.FOREGROUND_SERVICE_CAMERA'].forEach(name => { if(!uses.some(x=>x.$['android:name']===name)) uses.push({$:{'android:name':name}}); });
    app.activity = app.activity || [];
    if(!app.activity.some(x=>x.$['android:name']==='.calls.IncomingCallActivity')) app.activity.push({$:{'android:name':'.calls.IncomingCallActivity','android:excludeFromRecents':'true','android:exported':'false','android:launchMode':'singleTop','android:showWhenLocked':'true','android:turnScreenOn':'true','android:theme':'@android:style/Theme.Material.Light.NoActionBar'}});
    const main = app.activity.find(x => x.$['android:name']==='.MainActivity' || (x.$['android:name']||'').endsWith('.MainActivity')); if(main){main['intent-filter']=main['intent-filter']||[];if(!main['intent-filter'].some(f=>(f.data||[]).some(d=>d.$['android:scheme']==='realtimechat')))main['intent-filter'].push({'action':[{'$':{'android:name':'android.intent.action.VIEW'}}],'category':[{'$':{'android:name':'android.intent.category.DEFAULT'}},{'$':{'android:name':'android.intent.category.BROWSABLE'}}],'data':[{'$':{'android:scheme':'realtimechat'}}]});}
    app.service = app.service || [];
    if(!app.service.some(x=>x.$['android:name']==='.calls.IncomingCallMessagingService')) app.service.push({$:{'android:name':'.calls.IncomingCallMessagingService','android:exported':'false'} , 'intent-filter':[{'action':[{'$':{'android:name':'com.google.firebase.MESSAGING_EVENT'}}]}]});
    if(!app.service.some(x=>x.$['android:name']==='.calls.CallForegroundService')) app.service.push({$:{'android:name':'.calls.CallForegroundService','android:exported':'false','android:foregroundServiceType':'microphone|camera'}});
    return c;
  });
  config = withAppBuildGradle(config, c => { if(!c.modResults.contents.includes('firebase-messaging')) c.modResults.contents = c.modResults.contents.replace(/dependencies\s*\{/, "dependencies {\n    implementation platform('com.google.firebase:firebase-bom:34.5.0')\n    implementation 'com.google.firebase:firebase-messaging'\n    implementation 'androidx.core:core-ktx:1.15.0'"); return c; });
  config = withDangerousMod(config, ['android', async c => { const src=path.join(c.modRequest.projectRoot,'plugins/android-call/android/src/main/java/com/realtimechat/calls'); const dst=path.join(c.modRequest.platformProjectRoot,'app/src/main/java/com/realtimechat/app/calls'); fs.mkdirSync(dst,{recursive:true}); for(const f of fs.readdirSync(src))fs.copyFileSync(path.join(src,f),path.join(dst,f)); return c; }]);
  return config;
};
