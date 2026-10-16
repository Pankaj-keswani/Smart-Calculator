package com.voicecalcai.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.widget.RemoteViews
import android.widget.Toast
import java.util.Stack

class SmartCalcAppWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_KEY_PRESS = "com.smartcalc.ai.WIDGET_KEY_PRESS"
        const val ACTION_START_FLOAT = "com.smartcalc.ai.WIDGET_START_FLOAT"
        const val ACTION_UPDATE_DISPLAY = "com.smartcalc.ai.WIDGET_UPDATE_DISPLAY"
        const val EXTRA_KEY = "extra_key"
        const val EXTRA_DISPLAY_TEXT = "extra_display_text"
        const val PREFS_NAME = "smartcalc_widget_prefs"
        const val PREF_KEY_EXPR = "widget_expression"

        fun updateAllWidgets(context: Context, newText: String, statusText: String? = null) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(PREF_KEY_EXPR, newText).apply()

            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, SmartCalcAppWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget)

            for (widgetId in appWidgetIds) {
                val views = buildRemoteViews(context, widgetId, newText, statusText)
                appWidgetManager.updateAppWidget(widgetId, views)
            }
        }

        private fun buildRemoteViews(
            context: Context,
            widgetId: Int,
            displayText: String,
            statusText: String? = null
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_smartcalc)
            val friendly = displayText.replace("*", "×").replace("/", "÷")
            views.setTextViewText(R.id.widget_display, friendly)

            if (statusText != null) {
                views.setTextViewText(R.id.widget_title, statusText)
                views.setTextColor(R.id.widget_title, Color.parseColor("#EF4444"))
            } else {
                views.setTextViewText(R.id.widget_title, "SmartCalc AI")
                views.setTextColor(R.id.widget_title, Color.parseColor("#E6D01B"))
            }

            // 1. Voice button -> Open MainActivity with voice mode
            val voiceIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("autoVoice", true)
                data = Uri.parse("smartcalc://voice")
            }
            val voicePending = PendingIntent.getActivity(
                context,
                100,
                voiceIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_btn_voice, voicePending)

            // 2. Float button -> Launch FloatingCalculatorService directly
            val floatServiceIntent = Intent(context, FloatingCalculatorService::class.java)
            val floatPending = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PendingIntent.getForegroundService(
                    context,
                    200,
                    floatServiceIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            } else {
                PendingIntent.getService(
                    context,
                    200,
                    floatServiceIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            }
            views.setOnClickPendingIntent(R.id.widget_btn_float, floatPending)

            // 3. App button & Display -> Open MainActivity
            val appIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val appPending = PendingIntent.getActivity(
                context,
                300,
                appIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_btn_app, appPending)
            views.setOnClickPendingIntent(R.id.widget_display, appPending)

            // 4. Calculator keypad buttons
            val keyMap = mapOf(
                R.id.widget_btn_c to "C",
                R.id.widget_btn_lparen to "(",
                R.id.widget_btn_rparen to ")",
                R.id.widget_btn_div to "÷",
                R.id.widget_btn_7 to "7",
                R.id.widget_btn_8 to "8",
                R.id.widget_btn_9 to "9",
                R.id.widget_btn_mul to "×",
                R.id.widget_btn_4 to "4",
                R.id.widget_btn_5 to "5",
                R.id.widget_btn_6 to "6",
                R.id.widget_btn_sub to "-",
                R.id.widget_btn_1 to "1",
                R.id.widget_btn_2 to "2",
                R.id.widget_btn_3 to "3",
                R.id.widget_btn_add to "+",
                R.id.widget_btn_0 to "0",
                R.id.widget_btn_dot to ".",
                R.id.widget_btn_backspace to "⌫",
                R.id.widget_btn_equals to "="
            )

            var reqCode = 1000
            for ((viewId, key) in keyMap) {
                val keyIntent = Intent(context, SmartCalcAppWidgetProvider::class.java).apply {
                    action = ACTION_KEY_PRESS
                    putExtra(EXTRA_KEY, key)
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                }
                val keyPending = PendingIntent.getBroadcast(
                    context,
                    reqCode++,
                    keyIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(viewId, keyPending)
            }

            return views
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val currentExpr = prefs.getString(PREF_KEY_EXPR, "0") ?: "0"

        for (widgetId in appWidgetIds) {
            val views = buildRemoteViews(context, widgetId, currentExpr, null)
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)

        when (intent.action) {
            ACTION_KEY_PRESS -> {
                val key = intent.getStringExtra(EXTRA_KEY) ?: return
                handleKeyInput(context, key)
            }
            ACTION_START_FLOAT -> {
                try {
                    val floatServiceIntent = Intent(context, FloatingCalculatorService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(floatServiceIntent)
                    } else {
                        context.startService(floatServiceIntent)
                    }
                    Toast.makeText(context, "SmartCalc Floating Bubble active", Toast.LENGTH_SHORT).show()
                } catch (e: Throwable) {
                    try {
                        val mainIntent = Intent(context, MainActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        }
                        context.startActivity(mainIntent)
                    } catch (_: Throwable) {}
                }
            }
            ACTION_UPDATE_DISPLAY -> {
                val text = intent.getStringExtra(EXTRA_DISPLAY_TEXT) ?: "0"
                updateAllWidgets(context, text, null)
            }
        }
    }

    private fun handleKeyInput(context: Context, key: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var expr = prefs.getString(PREF_KEY_EXPR, "0") ?: "0"

        when (key) {
            "C" -> {
                triggerKeyHaptic(context, key)
                expr = "0"
                updateAllWidgets(context, expr, null)
            }
            "⌫" -> {
                triggerKeyHaptic(context, key)
                expr = if (expr.length > 1 && expr != "Error") {
                    expr.substring(0, expr.length - 1)
                } else {
                    "0"
                }
                updateAllWidgets(context, expr, null)
            }
            "=" -> {
                if (expr != "0" && expr != "Error") {
                    val trimmed = expr.trim()
                    if (trimmed.isNotEmpty() && trimmed.last() in "+-*/×÷(") {
                        triggerErrorHaptic(context)
                        Toast.makeText(context, "Calculation is still pending", Toast.LENGTH_SHORT).show()
                        updateAllWidgets(context, expr, "⚠️ Calculation pending")
                        return
                    }
                    try {
                        val result = evaluateMath(expr)
                        if (result.isNaN() || result.isInfinite()) {
                            expr = "Error"
                            triggerErrorHaptic(context)
                        } else if (result % 1.0 == 0.0 && Math.abs(result) < 1e15) {
                            expr = result.toLong().toString()
                            triggerSuccessHaptic(context)
                        } else {
                            expr = java.math.BigDecimal.valueOf(result).stripTrailingZeros().toPlainString()
                            triggerSuccessHaptic(context)
                        }
                        updateAllWidgets(context, expr, null)
                    } catch (_: Exception) {
                        triggerErrorHaptic(context)
                        Toast.makeText(context, "Calculation is still pending", Toast.LENGTH_SHORT).show()
                        updateAllWidgets(context, expr, "⚠️ Calculation pending")
                        return
                    }
                } else {
                    triggerKeyHaptic(context, key)
                }
            }
            "÷" -> {
                triggerKeyHaptic(context, key)
                expr = appendOperator(expr, "/")
                updateAllWidgets(context, expr, null)
            }
            "×" -> {
                triggerKeyHaptic(context, key)
                expr = appendOperator(expr, "*")
                updateAllWidgets(context, expr, null)
            }
            "+", "-" -> {
                triggerKeyHaptic(context, key)
                expr = appendOperator(expr, key)
                updateAllWidgets(context, expr, null)
            }
            else -> {
                triggerKeyHaptic(context, key)
                expr = if (expr == "0" || expr == "Error") {
                    if (key == ".") "0." else key
                } else {
                    expr + key
                }
                updateAllWidgets(context, expr, null)
            }
        }
    }

    private fun appendOperator(current: String, op: String): String {
        if (current == "Error") return "0" + op
        val lastChar = current.last()
        return if (lastChar in "+-*/×÷") {
            current.substring(0, current.length - 1) + op
        } else {
            current + op
        }
    }

    private fun getVibrator(context: Context): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator ?: (context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    private fun vibrateEffect(vibrator: Vibrator, effect: VibrationEffect, legacyDuration: Long = 15L) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val attrs = VibrationAttributes.Builder()
                    .setUsage(VibrationAttributes.USAGE_NOTIFICATION)
                    .build()
                vibrator.vibrate(effect, attrs)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val attrs = VibrationAttributes.Builder()
                    .setUsage(VibrationAttributes.USAGE_NOTIFICATION)
                    .build()
                vibrator.vibrate(effect, attrs)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val audioAttrs = android.media.AudioAttributes.Builder()
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                    .build()
                vibrator.vibrate(effect, audioAttrs)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(legacyDuration)
            }
        } catch (_: Throwable) {}
    }

    private fun triggerKeyHaptic(context: Context, key: String) {
        try {
            val vibrator = getVibrator(context) ?: return
            if (!vibrator.hasVibrator()) return

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val effect = if (key == "C") {
                    VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
                } else {
                    VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
                }
                vibrateEffect(vibrator, effect, if (key == "C") 18L else 12L)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val duration = if (key == "C") 18L else 12L
                val effect = VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE)
                vibrateEffect(vibrator, effect, duration)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(if (key == "C") 18L else 12L)
            }
        } catch (_: Throwable) {}
    }

    private fun triggerSuccessHaptic(context: Context) {
        try {
            val vibrator = getVibrator(context) ?: return
            if (!vibrator.hasVibrator()) return

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val effect = VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
                vibrateEffect(vibrator, effect, 25L)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createOneShot(25L, VibrationEffect.DEFAULT_AMPLITUDE)
                vibrateEffect(vibrator, effect, 25L)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(25L)
            }
        } catch (_: Throwable) {}
    }

    private fun triggerErrorHaptic(context: Context) {
        try {
            val vibrator = getVibrator(context) ?: return
            if (!vibrator.hasVibrator()) return

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createWaveform(longArrayOf(0, 35, 60, 35), -1)
                vibrateEffect(vibrator, effect, 60L)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(longArrayOf(0, 35, 60, 35), -1)
            }
        } catch (_: Throwable) {}
    }

    private fun evaluateMath(expression: String): Double {
        val sanitized = expression.replace("×", "*").replace("÷", "/").replace(" ", "")
        val tokens = ArrayList<String>()
        var i = 0
        while (i < sanitized.length) {
            val c = sanitized[i]
            if (c.isDigit() || c == '.') {
                val sb = StringBuilder()
                while (i < sanitized.length && (sanitized[i].isDigit() || sanitized[i] == '.')) {
                    sb.append(sanitized[i])
                    i++
                }
                tokens.add(sb.toString())
                continue
            } else if (c in "+-*/()") {
                tokens.add(c.toString())
            }
            i++
        }

        val outputQueue = ArrayList<String>()
        val operatorStack = Stack<String>()
        val precedence = mapOf("+" to 1, "-" to 1, "*" to 2, "/" to 2)

        for (token in tokens) {
            val num = token.toDoubleOrNull()
            if (num != null) {
                outputQueue.add(token)
            } else if (token in precedence.keys) {
                while (operatorStack.isNotEmpty() &&
                    operatorStack.peek() in precedence.keys &&
                    (precedence[operatorStack.peek()] ?: 0) >= (precedence[token] ?: 0)
                ) {
                    outputQueue.add(operatorStack.pop())
                }
                operatorStack.push(token)
            } else if (token == "(") {
                operatorStack.push(token)
            } else if (token == ")") {
                while (operatorStack.isNotEmpty() && operatorStack.peek() != "(") {
                    outputQueue.add(operatorStack.pop())
                }
                if (operatorStack.isNotEmpty()) operatorStack.pop()
            }
        }
        while (operatorStack.isNotEmpty()) {
            outputQueue.add(operatorStack.pop())
        }

        val evalStack = Stack<Double>()
        for (token in outputQueue) {
            val num = token.toDoubleOrNull()
            if (num != null) {
                evalStack.push(num)
            } else if (token in precedence.keys) {
                if (evalStack.size < 2) throw IllegalArgumentException("Calculation pending: incomplete expression")
                val b = evalStack.pop()
                val a = evalStack.pop()
                val res = when (token) {
                    "+" -> a + b
                    "-" -> a - b
                    "*" -> a * b
                    "/" -> if (b != 0.0) a / b else throw ArithmeticException("Division by zero")
                    else -> 0.0
                }
                evalStack.push(res)
            }
        }
        return if (evalStack.isNotEmpty()) evalStack.pop() else throw IllegalArgumentException("Empty expression")
    }
}
