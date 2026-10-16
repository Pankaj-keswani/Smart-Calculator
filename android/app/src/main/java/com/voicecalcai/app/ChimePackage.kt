package com.voicecalcai.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.util.Random
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin

class ChimeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "ChimeModule"

  private val sampleRate = 44100
  private val random = Random(42)

  // Pre-synthesized PCM buffers for key clicks
  private var mechClickBuffer: ShortArray? = null
  private var bubbleClickBuffer: ShortArray? = null
  private var modernClickBuffer: ShortArray? = null

  // Pre-synthesized PCM buffers for completion chimes
  private var mechChimeBuffer: ShortArray? = null
  private var bubbleChimeBuffer: ShortArray? = null
  private var modernChimeBuffer: ShortArray? = null

  // Ping-pong static AudioTracks for instant, polyphonic, zero-latency playback
  private var mechTrack1: AudioTrack? = null
  private var mechTrack2: AudioTrack? = null
  private var bubbleTrack1: AudioTrack? = null
  private var bubbleTrack2: AudioTrack? = null
  private var modernTrack1: AudioTrack? = null
  private var modernTrack2: AudioTrack? = null

  private var chimeMechTrack: AudioTrack? = null
  private var chimeBubbleTrack: AudioTrack? = null
  private var chimeModernTrack: AudioTrack? = null

  private var mechToggle = false
  private var bubbleToggle = false
  private var modernToggle = false

  init {
    Thread({
      try {
        synthesizeAllAudio()
        initAudioTracks()
      } catch (_: Throwable) {}
    }, "ChimeAudioInit").apply {
      isDaemon = true
      start()
    }
  }

  private fun synthesizeAllAudio() {
    // 1. Authentic Mechanical Keyboard Switch (Click + Thock) ~42ms
    val mechSamples = (sampleRate * 0.042).toInt()
    val mech = ShortArray(mechSamples)
    for (i in 0 until mechSamples) {
      val t = i.toDouble() / sampleRate
      // Phase 1: High-frequency metallic click leaf snap (0 to 6ms)
      val clickEnvelope = exp(-t / 0.0018)
      val metallicClick = (sin(2.0 * PI * 3600.0 * t) * 0.5 + sin(2.0 * PI * 5100.0 * t) * 0.3) * clickEnvelope
      val noise = (random.nextDouble() * 2.0 - 1.0) * 0.25 * clickEnvelope

      // Phase 2: Switch housing & keycap bottom-out thock (2 to 38ms)
      val thockEnvelope = if (t > 0.002) exp(-(t - 0.002) / 0.0085) else (t / 0.002)
      val bodyThock = (sin(2.0 * PI * 370.0 * t) * 0.65 + sin(2.0 * PI * 740.0 * t) * 0.25) * thockEnvelope

      val combined = (metallicClick + noise + bodyThock) * 0.82
      mech[i] = (combined.coerceIn(-1.0, 1.0) * 31000).toInt().toShort()
    }
    mechClickBuffer = mech

    // 2. Real Water Droplet / Bubble Pop ~38ms
    val bubbleSamples = (sampleRate * 0.038).toInt()
    val bubble = ShortArray(bubbleSamples)
    for (i in 0 until bubbleSamples) {
      val t = i.toDouble() / sampleRate
      val progress = t / 0.038
      // Upward frequency sweep 420 Hz -> 1350 Hz
      val freq = 420.0 + 930.0 * progress.pow(1.8)
      val envelope = when {
        progress < 0.06 -> progress / 0.06
        else -> (1.0 - progress).pow(1.4)
      }
      val sample = sin(2.0 * PI * freq * t) * envelope * 0.85
      bubble[i] = (sample.coerceIn(-1.0, 1.0) * 30000).toInt().toShort()
    }
    bubbleClickBuffer = bubble

    // 3. Modern Sleek Soft Pip ~18ms
    val modernSamples = (sampleRate * 0.018).toInt()
    val modern = ShortArray(modernSamples)
    for (i in 0 until modernSamples) {
      val t = i.toDouble() / sampleRate
      val envelope = exp(-t / 0.0038)
      val sample = (sin(2.0 * PI * 880.0 * t) * 0.75 + sin(2.0 * PI * 1760.0 * t) * 0.25) * envelope * 0.75
      modern[i] = (sample.coerceIn(-1.0, 1.0) * 28000).toInt().toShort()
    }
    modernClickBuffer = modern

    // 4. Mechanical Chime: Vintage Typewriter Bell Ding ~240ms
    val chimeMechSamples = (sampleRate * 0.24).toInt()
    val chimeMech = ShortArray(chimeMechSamples)
    for (i in 0 until chimeMechSamples) {
      val t = i.toDouble() / sampleRate
      val bellEnvelope = exp(-t / 0.058)
      val bell = (sin(2.0 * PI * 1760.0 * t) * 0.6 + sin(2.0 * PI * 2640.0 * t) * 0.4) * bellEnvelope
      chimeMech[i] = (bell.coerceIn(-1.0, 1.0) * 29000).toInt().toShort()
    }
    mechChimeBuffer = chimeMech

    // 5. Bubble Chime: Ascending Double Bubble Pop ~120ms
    val chimeBubbleSamples = (sampleRate * 0.12).toInt()
    val chimeBubble = ShortArray(chimeBubbleSamples)
    for (i in 0 until chimeBubbleSamples) {
      val t = i.toDouble() / sampleRate
      var sample = 0.0
      // Pop 1 (0 to 45ms)
      if (t < 0.045) {
        val p1 = t / 0.045
        val f1 = 450.0 + 800.0 * p1.pow(1.6)
        val env1 = if (p1 < 0.08) p1 / 0.08 else (1.0 - p1).pow(1.3)
        sample += sin(2.0 * PI * f1 * t) * env1 * 0.65
      }
      // Pop 2 (38 to 95ms)
      if (t >= 0.038 && t < 0.095) {
        val t2 = t - 0.038
        val p2 = t2 / 0.057
        val f2 = 720.0 + 980.0 * p2.pow(1.6)
        val env2 = if (p2 < 0.08) p2 / 0.08 else (1.0 - p2).pow(1.3)
        sample += sin(2.0 * PI * f2 * t2) * env2 * 0.8
      }
      chimeBubble[i] = (sample.coerceIn(-1.0, 1.0) * 30000).toInt().toShort()
    }
    bubbleChimeBuffer = chimeBubble

    // 6. Modern Chime: Pure Harmonic Triad (D5 587Hz + A5 880Hz + D6 1175Hz) ~180ms
    val chimeModSamples = (sampleRate * 0.18).toInt()
    val chimeMod = ShortArray(chimeModSamples)
    for (i in 0 until chimeModSamples) {
      val t = i.toDouble() / sampleRate
      val env = exp(-t / 0.048)
      val sample = (sin(2.0 * PI * 587.33 * t) * 0.45 + sin(2.0 * PI * 880.0 * t) * 0.35 + sin(2.0 * PI * 1174.66 * t) * 0.2) * env
      chimeMod[i] = (sample.coerceIn(-1.0, 1.0) * 28000).toInt().toShort()
    }
    modernChimeBuffer = chimeMod
  }

  private fun buildStaticTrack(buffer: ShortArray?): AudioTrack? {
    if (buffer == null || buffer.isEmpty()) return null
    return try {
      val track = AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        )
        .setBufferSizeInBytes(buffer.size * 2)
        .setTransferMode(AudioTrack.MODE_STATIC)
        .build()

      if (track.state == AudioTrack.STATE_INITIALIZED) {
        track.write(buffer, 0, buffer.size)
        track
      } else {
        try { track.release() } catch (_: Throwable) {}
        null
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun initAudioTracks() {
    mechTrack1 = buildStaticTrack(mechClickBuffer)
    mechTrack2 = buildStaticTrack(mechClickBuffer)

    bubbleTrack1 = buildStaticTrack(bubbleClickBuffer)
    bubbleTrack2 = buildStaticTrack(bubbleClickBuffer)

    modernTrack1 = buildStaticTrack(modernClickBuffer)
    modernTrack2 = buildStaticTrack(modernClickBuffer)

    chimeMechTrack = buildStaticTrack(mechChimeBuffer)
    chimeBubbleTrack = buildStaticTrack(bubbleChimeBuffer)
    chimeModernTrack = buildStaticTrack(modernChimeBuffer)
  }

  private fun playStaticTrack(track: AudioTrack?) {
    if (track == null || track.state != AudioTrack.STATE_INITIALIZED) return
    try {
      track.pause()
      track.flush()
      track.setPlaybackHeadPosition(0)
      track.play()
    } catch (_: Throwable) {}
  }

  override fun invalidate() {
    super.invalidate()
    val tracks = listOf(
      mechTrack1, mechTrack2,
      bubbleTrack1, bubbleTrack2,
      modernTrack1, modernTrack2,
      chimeMechTrack, chimeBubbleTrack, chimeModernTrack
    )
    for (t in tracks) {
      try {
        t?.stop()
        t?.release()
      } catch (_: Throwable) {}
    }
  }

  @ReactMethod
  fun playKeyClick(theme: String?) {
    val soundTheme = theme ?: "modern"
    if (soundTheme == "silent") return

    when (soundTheme) {
      "mechanical" -> {
        mechToggle = !mechToggle
        val track = if (mechToggle) mechTrack1 else mechTrack2
        playStaticTrack(track)
      }
      "bubble" -> {
        bubbleToggle = !bubbleToggle
        val track = if (bubbleToggle) bubbleTrack1 else bubbleTrack2
        playStaticTrack(track)
      }
      else -> {
        modernToggle = !modernToggle
        val track = if (modernToggle) modernTrack1 else modernTrack2
        playStaticTrack(track)
      }
    }
  }

  @ReactMethod
  fun playChime(theme: String?) {
    val soundTheme = theme ?: "modern"
    if (soundTheme == "silent") return

    when (soundTheme) {
      "mechanical" -> playStaticTrack(chimeMechTrack)
      "bubble" -> playStaticTrack(chimeBubbleTrack)
      else -> playStaticTrack(chimeModernTrack)
    }
  }

  @ReactMethod
  fun triggerHaptic(type: String?) {
    try {
      val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vm = reactContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vm?.defaultVibrator ?: (reactContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)
      } else {
        @Suppress("DEPRECATION")
        reactContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      } ?: return

      if (!vibrator.hasVibrator()) return

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val effect = when (type) {
          // Tactile bump simulating mechanical keyboard switch actuation
          "mechanical" -> VibrationEffect.createWaveform(longArrayOf(0, 8, 10, 12), intArrayOf(0, 180, 0, 255), -1)
          "keypad" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
          "light" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
          "heavy" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
          "double" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_DOUBLE_CLICK)
          "success" -> VibrationEffect.createWaveform(longArrayOf(0, 18, 55, 22), intArrayOf(0, 200, 0, 255), -1)
          "error" -> VibrationEffect.createWaveform(longArrayOf(0, 25, 45, 25, 45, 30), intArrayOf(0, 255, 0, 255, 0, 255), -1)
          else -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
        }
        vibrator.vibrate(effect)
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val ms = when (type) {
          "mechanical" -> 14L
          "light" -> 10L
          "keypad" -> 14L
          "heavy" -> 28L
          "success" -> 22L
          "error" -> 35L
          else -> 14L
        }
        vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        val ms = when (type) {
          "mechanical" -> 14L
          "light" -> 10L
          "keypad" -> 14L
          "heavy" -> 28L
          else -> 14L
        }
        @Suppress("DEPRECATION")
        vibrator.vibrate(ms)
      }
    } catch (_: Throwable) {}
  }
}

class ChimePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(ChimeModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
