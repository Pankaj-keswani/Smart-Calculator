# SmartCalc AI — Voice-First Intelligent Calculator (Android & iOS)

**SmartCalc AI** is a production-ready, cross-platform (**Android & iOS**) voice calculator built with **React Native (Expo) + TypeScript**. It allows users to perform arithmetic, everyday financial math (GST, discounts, tips, bill splitting), scientific operations, unit conversions, and contextual follow-up calculations through natural spoken commands in English, Indian English, and Hinglish.

---

## 1. Architecture & Core Pipeline

SmartCalc AI strictly separates **Natural-Language Intent Understanding** from **Deterministic Mathematical Calculation** so the AI never hallucinates math results or executes unsafe code:

```text
VOICE INPUT (Microphone)
   ↓
SPEECH TO TEXT (SpeechService)
   ↓
AI INTENT PARSER (AIService / NLFallbackParser)
   ↓
STRUCTURED JSON (StructuredAIIntent)
   ↓
STRICT SCHEMA VALIDATION (schemaValidator.ts)
   ↓
SAFE DETERMINISTIC ENGINE (CalculationService / ConversionService / CurrencyService)
   ↓
RESULT DISPLAY + TEXT TO SPEECH (TextToSpeechService) + LOCAL HISTORY (HistoryService)
```

### Security & Reliability Guarantees
- **Zero `eval()` or dynamic code execution**: Expressions are evaluated using a custom lexical tokenizer, **Shunting-Yard** parser, and Reverse Polish Notation (**RPN**) evaluator in [`src/engine/CalculationService.ts`](src/engine/CalculationService.ts).
- **Strict JSON Schema Validation**: Every AI response is validated by [`src/models/schemaValidator.ts`](src/models/schemaValidator.ts) before touching the calculation engine.
- **No Hallucinated Exchange Rates**: [`src/engine/CurrencyService.ts`](src/engine/CurrencyService.ts) queries live exchange-rate APIs and clearly informs the user when live rate data is unavailable—never inventing static rates.
- **Human-Friendly Error Handling**: Never displays `NaN`, `Infinity`, `undefined`, or `null`. Division by zero, negative square roots, numeric overflow, and ambiguous commands produce natural spoken & visual messages.

---

## 2. Project Structure

```text
Smart Calculator/
├── App.tsx                                 # Application root entry point
├── app.json                                # Expo Android & iOS configuration & permissions
├── .env.example                            # Environment variable template (AI_API_KEY, AI_BASE_URL, AI_MODEL)
├── package.json                            # Dependencies and scripts
├── tsconfig.json                           # Strict TypeScript configuration
├── jest.config.js                          # Jest test suite configuration
├── src/
│   ├── config/
│   │   └── env.ts                          # Secure environment & provider preset configuration
│   ├── models/
│   │   ├── types.ts                        # Domain models, intents, context, history, settings
│   │   └── schemaValidator.ts              # Strict JSON validator for AI output
│   ├── ai/
│   │   ├── systemPrompt.ts                 # Dedicated system prompt for the AI intent parser
│   │   ├── nlFallbackParser.ts             # Deterministic English + Hinglish NL parser / Mock AI
│   │   └── AIService.ts                    # Pluggable AI service (OpenAI, Gemini, Groq, Claude, Custom, Mock)
│   ├── engine/
│   │   ├── CalculationService.ts           # Safe Shunting-Yard expression parser & everyday math engine
│   │   ├── ConversionService.ts            # Unit conversion across 8 categories
│   │   └── CurrencyService.ts              # Modular live currency conversion service
│   ├── services/
│   │   ├── SpeechService.ts                # Speech-to-Text abstraction
│   │   ├── TextToSpeechService.ts          # Text-to-Speech synthesis & voice controls
│   │   ├── HistoryService.ts               # Offline-first persistent calculation history
│   │   ├── SettingsService.ts              # Persistent user & API settings
│   │   └── SmartCalcOrchestrator.ts        # Full end-to-end pipeline & conversational context manager
│   ├── localization/
│   │   └── i18n.ts                         # Multilingual UI & voice strings (en-US, en-IN, hi-IN)
│   ├── theme/
│   │   └── theme.ts                        # Light & Dark mode consumer design system
│   ├── utils/
│   │   └── haptics.ts                      # Tactile haptic feedback helpers
│   └── ui/
│       ├── components/
│       │   ├── HeaderBar.tsx               # App status, Voice/Keypad switcher, History & Settings triggers
│       │   ├── ResultDisplay.tsx           # Large result, expression, breakdown, copy/share/speak actions
│       │   ├── MicrophoneButton.tsx        # Animated central microphone (Idle, Listening, Thinking, Answering)
│       │   ├── QuickPromptsBar.tsx         # Natural voice command input & example chips
│       │   ├── ManualCalculator.tsx        # Traditional + Scientific calculator sharing history & context
│       │   ├── HistoryModal.tsx            # Local calculation history sheet
│       │   └── SettingsModal.tsx           # Runtime AI API credentials, TTS & theme configuration
│       └── screens/
│           └── HomeScreen.tsx              # Main screen orchestrating Voice & Keypad modes
└── tests/
    ├── calculationEngine.test.ts           # Unit tests for all math, everyday, conversion & error cases
    └── pipelineIntegration.test.ts         # End-to-end Voice -> STT -> AI -> Calc -> TTS -> History tests
```

---

## 3. Setup & Environment Configuration

### Prerequisites
- **Node.js** >= 18
- **npm** or **yarn**
- **Expo Go** app on your Android or iOS device (or Android Studio / Xcode emulator)

### Step 1: Install Dependencies
```bash
npm install --legacy-peer-deps
```

### Step 2: Configure AI API Credentials
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your preferred AI provider credentials:
```env
EXPO_PUBLIC_AI_PROVIDER=openai
EXPO_PUBLIC_AI_API_KEY=your_api_key_here
EXPO_PUBLIC_AI_BASE_URL=https://api.openai.com/v1
EXPO_PUBLIC_AI_MODEL=gpt-4o-mini
```

> **In-App Configuration**: You can also configure or switch `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, and the AI Provider (`OpenAI`, `Gemini`, `Groq`, `Claude`, `Custom`, or `Local / Offline`) directly inside the app by tapping the **⚙ Settings** icon in the top-right corner!
>
> **Works Out-of-the-Box Without an API Key**: If `AI_API_KEY` is left blank, SmartCalc AI automatically uses its built-in deterministic Natural Language & Hinglish parser (`NLFallbackParser`) so you can test the entire workflow immediately offline or before adding a cloud key.

---

## 4. Running the Application

```bash
# Start Expo development server (scan QR code with Android or iOS)
npm start

# Run on Android device / emulator
npm run android

# Run on iOS simulator / device
npm run ios

# Run in Web browser
npm run web
```

---

## 5. Running Tests & Typecheck

```bash
# Run the full Jest unit & integration test suite
npm test

# Run TypeScript compiler check
npm run typecheck
```
