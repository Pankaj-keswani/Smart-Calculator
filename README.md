# VoiceCalc AI — Offline Voice Calculator (Android & iOS)

**VoiceCalc** is a voice-first calculator built with **React Native (Expo) + TypeScript**.
Everything runs **on the phone**: no AI service, no API keys, no accounts, no internet.
Speak or type arithmetic, percentages, GST / discounts / tips, bill splits, scientific
functions, unit conversions and currency conversions (with rates you save) in English,
Indian English, Hinglish or Hindi.

---

## 1. How it works (100% on-device)

```text
MICROPHONE
   ↓
ON-DEVICE SPEECH-TO-TEXT        src/services/SpeechService.ts
   (Android on-device recognizer when the offline language pack is installed,
    otherwise Google's recognizer with "prefer offline"; up to 5 hypotheses)
   ↓
TRANSCRIPT NORMALIZER           src/voice/transcriptNormalizer.ts
   ("1,00,000", "2 lakh", "₹500", "10 − 3", Devanagari, Hinglish, "7 times 8 is")
   ↓
RULE-BASED PARSER               src/parser/  (MathStreamFilter, nlParser, IntentService)
   ↓
VALIDATION                      src/models/schemaValidator.ts
   ↓
SAFE CALCULATION ENGINE         src/engine/  (no eval: tokenizer → shunting-yard → RPN)
   ↓
RESULT + SPOKEN ANSWER + LOCAL HISTORY
```

- **No network code.** Release builds also strip Android's `INTERNET` permission
  (`android/app/src/release/AndroidManifest.xml`), so the OS guarantees it.
- **Offline speech.** Settings → *Offline Speech* shows whether your language pack is
  installed and can download it (Android 13+). Older phones use the offline voice-typing
  pack from the Google app (Settings → Voice → Offline speech recognition).
- **Currency.** Rates are never downloaded or invented. Enter them once in
  Settings → *Currency rates (offline)*; e.g. "100 dollars to rupees" then works offline.

## 2. Project structure

```text
src/
├── engine/        CalculationService, JevCalculationEngine, Conversion & Currency services
├── parser/        IntentService (on-device), nlParser (English/Hinglish rules), MathStreamFilter
├── voice/         transcriptNormalizer (speech-text clean-up)
├── services/      SpeechService, TextToSpeechService, SmartCalcOrchestrator, History, Settings
├── models/        types, schemaValidator
├── localization/  UI strings (en-US, en-IN, hi-IN, es, fr, de)
├── utils/         numberFormat (1,50,000 grouping), haptics, sound, floatingOverlay
└── ui/            HomeScreen, ManualCalculator, ResultDisplay, Settings, History...
android/app/src/main/java/com/voicecalcai/app/
                   Floating bubble service, home-screen widget, Quick Settings tile
tests/             Jest suites (engine, parser, voice accuracy corpus, speech recovery)
```

## 3. Run

```bash
npm install --legacy-peer-deps
npx expo run:android      # debug build on a device / emulator
npm test                  # Jest suites
npm run typecheck
```

No `.env` or keys are needed.
