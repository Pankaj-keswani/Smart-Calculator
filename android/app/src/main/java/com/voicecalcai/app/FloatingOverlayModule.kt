package com.voicecalcai.app

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FloatingOverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FloatingOverlayModule"

    @ReactMethod
    fun isOverlayPermissionGranted(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(Settings.canDrawOverlays(reactContext))
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + reactContext.packageName)
            ).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactContext.startActivity(intent)
        }
    }

    @ReactMethod
    fun startFloatingCalculator(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                promise.resolve(false)
                return
            }
            val intent = Intent(reactContext, FloatingCalculatorService::class.java)
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            e.printStackTrace()
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun stopFloatingCalculator() {
        try {
            val intent = Intent(reactContext, FloatingCalculatorService::class.java)
            reactContext.stopService(intent)
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun enterPictureInPicture(promise: Promise) {
        val activity: Activity? = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Current activity is null")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val params = PictureInPictureParams.Builder().build()
                val success = activity.enterPictureInPictureMode(params)
                promise.resolve(success)
            } catch (e: Exception) {
                promise.reject("PIP_ERROR", e.message)
            }
        } else {
            promise.reject("UNSUPPORTED", "Picture-in-picture requires Android 8.0+")
        }
    }

    @ReactMethod
    fun updateWidgetDisplay(text: String) {
        try {
            SmartCalcAppWidgetProvider.updateAllWidgets(reactContext, text)
        } catch (_: Exception) {}
    }
}
