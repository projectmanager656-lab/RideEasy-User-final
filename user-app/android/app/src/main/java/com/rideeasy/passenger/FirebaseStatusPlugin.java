package com.rideeasy.passenger;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;

/**
 * Reports whether Firebase (FCM) is initialized in this process.
 *
 * @capacitor/push-notifications' register() calls FirebaseMessaging.getInstance()
 * unguarded — with no google-services.json (no FirebaseApp) that throws
 * IllegalStateException on the CapacitorPlugins handler thread and kills the
 * whole process ("keeps stopping"). The JS push flow probes this plugin first
 * and skips registration gracefully until a real google-services.json is added;
 * once it exists, registration turns on automatically — no code change needed.
 */
@CapacitorPlugin(name = "FirebaseStatus")
public class FirebaseStatusPlugin extends Plugin {

    @PluginMethod
    public void isInitialized(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("initialized", FirebaseApp.getApps(context).size() > 0);
        call.resolve(result);
    }
}
