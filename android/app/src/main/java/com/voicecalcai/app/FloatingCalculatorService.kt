package com.voicecalcai.app

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.util.Stack
import kotlin.math.abs

class FloatingCalculatorService : Service() {

    private var windowManager: WindowManager? = null
    private var containerView: FrameLayout? = null
    private var bubbleView: FrameLayout? = null
    private var keypadPanel: LinearLayout? = null
    private var displayScrollView: HorizontalScrollView? = null
    private var displayTextView: TextView? = null
    private var titleTextView: TextView? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private val resetTitleRunnable = Runnable {
        resetTitle()
    }

    private var isExpanded = false
    private var currentInput = ""
    private var lastResult = ""

    private var params: WindowManager.LayoutParams? = null

    companion object {
        const val CHANNEL_ID = "smartcalc_floating_channel"
        const val NOTIFICATION_ID = 4041
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        try {
            windowManager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            startForegroundServiceNotification()
            createFloatingView()
        } catch (e: Throwable) {
            e.printStackTrace()
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                stopSelf()
                return START_NOT_STICKY
            }
            if (containerView == null) {
                createFloatingView()
            }
        } catch (_: Throwable) {}
        return START_NOT_STICKY
    }

    private fun startForegroundServiceNotification() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "SmartCalc Floating Overlay",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Shows floating calculator bubble over apps"
                    setShowBadge(false)
                }
                val nm = getSystemService(NotificationManager::class.java)
                nm?.createNotificationChannel(channel)
            }

            val iconRes = applicationInfo.icon.let { if (it != 0) it else android.R.drawable.ic_dialog_info }

            val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("SmartCalc Floating Mode Active")
                .setContentText("Tap bubble on screen to calculate over any app")
                .setSmallIcon(iconRes)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build()

            if (Build.VERSION.SDK_INT >= 34) { // Android 14+
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Throwable) {
            e.printStackTrace()
        }
    }

    private fun dpToPx(dp: Float): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            resources.displayMetrics
        ).toInt()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun createFloatingView() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                stopSelf()
                return
            }
            if (containerView != null) return

            val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutFlag,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = dpToPx(16f)
                y = dpToPx(140f)
            }

            containerView = FrameLayout(this)

            // 1. Bubble View (Circular 56dp icon)
            val bubbleSize = dpToPx(56f)
            bubbleView = FrameLayout(this).apply {
                layoutParams = FrameLayout.LayoutParams(bubbleSize, bubbleSize)
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#1C1C1C"))
                    setStroke(dpToPx(2.5f), Color.parseColor("#E6D01B"))
                }
                elevation = dpToPx(8f).toFloat()

                val icon = ImageView(this@FloatingCalculatorService).apply {
                    layoutParams = FrameLayout.LayoutParams(dpToPx(28f), dpToPx(28f)).apply {
                        gravity = Gravity.CENTER
                    }
                    setImageResource(R.drawable.ic_calc_tile)
                    setColorFilter(Color.parseColor("#E6D01B"))
                }
                addView(icon)
            }

            // 2. Keypad Panel (Expanded 290dp mini calculator)
            val panelWidth = dpToPx(290f)
            keypadPanel = LinearLayout(this).apply {
                layoutParams = FrameLayout.LayoutParams(panelWidth, FrameLayout.LayoutParams.WRAP_CONTENT)
                orientation = LinearLayout.VERTICAL
                setPadding(dpToPx(12f), dpToPx(12f), dpToPx(12f), dpToPx(12f))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(18f).toFloat()
                    setColor(Color.parseColor("#181818"))
                    setStroke(dpToPx(1.5f), Color.parseColor("#2C2C29"))
                }
                elevation = dpToPx(12f).toFloat()
                visibility = View.GONE
            }

            buildKeypadUI(keypadPanel!!)

            containerView?.addView(bubbleView)
            containerView?.addView(keypadPanel)

            // Touch dragging and click handling
            var initialX = 0
            var initialY = 0
            var initialTouchX = 0f
            var initialTouchY = 0f
            var isDragging = false

            bubbleView?.setOnTouchListener { _, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params?.x ?: 0
                        initialY = params?.y ?: 0
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        isDragging = false
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.rawX - initialTouchX).toInt()
                        val dy = (event.rawY - initialTouchY).toInt()
                        if (abs(dx) > 10 || abs(dy) > 10) {
                            isDragging = true
                            params?.x = initialX + dx
                            params?.y = initialY + dy
                            try {
                                windowManager?.updateViewLayout(containerView, params)
                            } catch (_: Throwable) {}
                        }
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (!isDragging) {
                            toggleExpanded()
                        }
                        true
                    }
                    else -> false
                }
            }

            if (containerView != null && containerView?.parent == null) {
                windowManager?.addView(containerView, params)
            }
        } catch (e: Throwable) {
            e.printStackTrace()
            stopSelf()
        }
    }

    private fun toggleExpanded() {
        isExpanded = !isExpanded
        if (isExpanded) {
            bubbleView?.visibility = View.GONE
            keypadPanel?.visibility = View.VISIBLE
        } else {
            keypadPanel?.visibility = View.GONE
            bubbleView?.visibility = View.VISIBLE
        }
        try {
            containerView?.requestLayout()
            windowManager?.updateViewLayout(containerView, params)
        } catch (_: Throwable) {}
    }

    private fun buildKeypadUI(panel: LinearLayout) {
        // Header Bar (Title, Collapse, Close)
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dpToPx(8f))
        }

        titleTextView = TextView(this).apply {
            text = "SmartCalc Mini"
            setTextColor(Color.parseColor("#E6D01B"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val copyBtn = TextView(this).apply {
            text = "📋 Copy"
            setTextColor(Color.parseColor("#F5F5F0"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setPadding(dpToPx(8f), dpToPx(4f), dpToPx(8f), dpToPx(4f))
            background = GradientDrawable().apply {
                cornerRadius = dpToPx(8f).toFloat()
                setColor(Color.parseColor("#2A2A2A"))
            }
            setOnClickListener {
                copyResultToClipboard()
            }
        }

        val minimizeBtn = TextView(this).apply {
            text = "  ━  "
            setTextColor(Color.parseColor("#A0A090"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dpToPx(6f), dpToPx(2f), dpToPx(6f), dpToPx(2f))
            setOnClickListener {
                toggleExpanded()
            }
        }

        val closeBtn = TextView(this).apply {
            text = "  ✕  "
            setTextColor(Color.parseColor("#EF4444"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dpToPx(6f), dpToPx(2f), dpToPx(6f), dpToPx(2f))
            setOnClickListener {
                stopSelf()
            }
        }

        header.addView(titleTextView)
        header.addView(copyBtn)
        header.addView(minimizeBtn)
        header.addView(closeBtn)
        panel.addView(header)

        // Display Screen inside HorizontalScrollView for unlimited calculation length
        displayScrollView = HorizontalScrollView(this).apply {
            isFillViewport = true
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
            background = GradientDrawable().apply {
                cornerRadius = dpToPx(12f).toFloat()
                setColor(Color.parseColor("#0F0F0F"))
                setStroke(dpToPx(1f), Color.parseColor("#262624"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpToPx(48f)
            ).apply {
                bottomMargin = dpToPx(8f)
            }
        }

        displayTextView = TextView(this).apply {
            text = "0"
            setTextColor(Color.parseColor("#F5F5F0"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            setPadding(dpToPx(10f), dpToPx(8f), dpToPx(10f), dpToPx(8f))
            isSingleLine = true
            maxLines = 1
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        displayScrollView?.addView(displayTextView)
        panel.addView(displayScrollView)

        // Buttons Grid
        val buttonRows = arrayOf(
            arrayOf("AC", "(", ")", "÷"),
            arrayOf("7", "8", "9", "×"),
            arrayOf("4", "5", "6", "-"),
            arrayOf("1", "2", "3", "+"),
            arrayOf("0", ".", "⌫", "=")
        )

        for (row in buttonRows) {
            val rowLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dpToPx(6f)
                }
            }

            for (label in row) {
                val btn = Button(this).apply {
                    text = label
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                    isAllCaps = false
                    val isEquals = label == "="
                    val isAction = label in arrayOf("AC", "(", ")", "÷", "×", "-", "+", "⌫")

                    if (isEquals) {
                        setTextColor(Color.parseColor("#141413"))
                        background = GradientDrawable().apply {
                            shape = GradientDrawable.RECTANGLE
                            cornerRadius = dpToPx(10f).toFloat()
                            setColor(Color.parseColor("#E6D01B"))
                        }
                    } else if (isAction) {
                        setTextColor(Color.parseColor("#181815"))
                        background = GradientDrawable().apply {
                            shape = GradientDrawable.RECTANGLE
                            cornerRadius = dpToPx(10f).toFloat()
                            setColor(Color.parseColor("#C2BC90"))
                        }
                    } else {
                        setTextColor(Color.parseColor("#F5F5F0"))
                        background = GradientDrawable().apply {
                            shape = GradientDrawable.RECTANGLE
                            cornerRadius = dpToPx(10f).toFloat()
                            setColor(Color.parseColor("#2A2A2A"))
                        }
                    }

                    layoutParams = LinearLayout.LayoutParams(0, dpToPx(42f), 1f).apply {
                        setMargins(dpToPx(2f), 0, dpToPx(2f), 0)
                    }

                    setOnClickListener {
                        handleButtonClick(label)
                    }
                }
                rowLayout.addView(btn)
            }
            panel.addView(rowLayout)
        }
    }

    private fun vibrateEffect(effect: VibrationEffect, legacyDuration: Long = 14L) {
        try {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (!v.hasVibrator()) return

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val attrs = VibrationAttributes.Builder()
                    .setUsage(VibrationAttributes.USAGE_NOTIFICATION)
                    .build()
                v.vibrate(effect, attrs)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val attrs = VibrationAttributes.Builder()
                    .setUsage(VibrationAttributes.USAGE_NOTIFICATION)
                    .build()
                v.vibrate(effect, attrs)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val audioAttrs = android.media.AudioAttributes.Builder()
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                    .build()
                v.vibrate(effect, audioAttrs)
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(legacyDuration)
            }
        } catch (_: Throwable) {}
    }

    private fun triggerButtonHaptic() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                vibrateEffect(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK), 14L)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrateEffect(VibrationEffect.createOneShot(14L, VibrationEffect.DEFAULT_AMPLITUDE), 14L)
            } else {
                val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                @Suppress("DEPRECATION")
                v?.vibrate(14L)
            }
        } catch (_: Throwable) {}
    }

    private fun triggerSuccessHaptic() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                vibrateEffect(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK), 25L)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrateEffect(VibrationEffect.createOneShot(25L, VibrationEffect.DEFAULT_AMPLITUDE), 25L)
            } else {
                val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                @Suppress("DEPRECATION")
                v?.vibrate(25L)
            }
        } catch (_: Throwable) {}
    }

    private fun triggerErrorHaptic() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrateEffect(VibrationEffect.createWaveform(longArrayOf(0, 35, 60, 35), -1), 60L)
            } else {
                val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                @Suppress("DEPRECATION")
                v?.vibrate(longArrayOf(0, 35, 60, 35), -1)
            }
        } catch (_: Throwable) {}
    }

    private fun resetTitle() {
        titleTextView?.text = "SmartCalc Mini"
        titleTextView?.setTextColor(Color.parseColor("#E6D01B"))
    }

    private fun showPendingCalculationError() {
        triggerErrorHaptic()
        Toast.makeText(this, "Calculation is still pending", Toast.LENGTH_SHORT).show()
        titleTextView?.text = "⚠️ Calculation pending"
        titleTextView?.setTextColor(Color.parseColor("#EF4444"))
        mainHandler.removeCallbacks(resetTitleRunnable)
        mainHandler.postDelayed(resetTitleRunnable, 2500)
    }

    private fun updateDisplay(text: String) {
        displayTextView?.text = text
        displayScrollView?.post {
            displayScrollView?.fullScroll(View.FOCUS_RIGHT)
        }
    }

    private fun handleButtonClick(label: String) {
        if (label != "=") {
            triggerButtonHaptic()
            resetTitle()
        }
        when (label) {
            "AC" -> {
                currentInput = ""
                lastResult = ""
                updateDisplay("0")
            }
            "⌫" -> {
                if (currentInput.isNotEmpty()) {
                    currentInput = currentInput.substring(0, currentInput.length - 1)
                    updateDisplay(if (currentInput.isEmpty()) "0" else currentInput)
                }
            }
            "=" -> {
                if (currentInput.isNotEmpty()) {
                    evaluateAndDisplay()
                } else {
                    triggerButtonHaptic()
                }
            }
            "÷" -> appendOperator("÷")
            "×" -> appendOperator("×")
            else -> {
                currentInput += label
                updateDisplay(currentInput)
            }
        }
    }

    private fun appendOperator(op: String) {
        if (currentInput.isEmpty()) {
            if (lastResult.isNotEmpty()) {
                currentInput = lastResult + op
            }
        } else {
            val lastChar = currentInput.last()
            if (lastChar in "+-×÷*/") {
                currentInput = currentInput.substring(0, currentInput.length - 1) + op
            } else {
                currentInput += op
            }
        }
        updateDisplay(currentInput)
    }

    private fun evaluateAndDisplay() {
        if (currentInput.isEmpty()) return
        val trimmed = currentInput.trim()
        if (trimmed.isNotEmpty() && trimmed.last() in "+-*/×÷(") {
            showPendingCalculationError()
            return
        }
        try {
            val res = evaluateSimpleMath(currentInput)
            val formatted = if (res.isNaN() || res.isInfinite()) {
                "Error"
            } else if (res % 1.0 == 0.0 && abs(res) < 1e15) {
                res.toLong().toString()
            } else {
                java.math.BigDecimal.valueOf(res).stripTrailingZeros().toPlainString()
            }
            lastResult = formatted
            updateDisplay(formatted)
            currentInput = formatted
            resetTitle()
            triggerSuccessHaptic()
        } catch (_: Exception) {
            showPendingCalculationError()
        }
    }

    private fun copyResultToClipboard() {
        val target = if (lastResult.isNotEmpty()) lastResult else displayTextView?.text?.toString() ?: "0"
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("SmartCalc Result", target)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(this, "Copied $target to clipboard", Toast.LENGTH_SHORT).show()
    }

    // Lightweight deterministic arithmetic evaluator
    private fun evaluateSimpleMath(expression: String): Double {
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

        // Shunting-yard algorithm
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

        // Evaluate RPN
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

    override fun onDestroy() {
        super.onDestroy()
        mainHandler.removeCallbacksAndMessages(null)
        try {
            if (containerView != null && containerView?.parent != null) {
                windowManager?.removeView(containerView)
            }
        } catch (_: Throwable) {}
        containerView = null
    }
}
