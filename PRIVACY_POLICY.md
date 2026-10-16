# Privacy Policy for SmartCalc AI

**Last Updated:** October 14, 2026  
**Effective Date:** October 14, 2026  
**Developer:** SmartCalc AI Team  
**Contact:** [support@smartcalc.ai](mailto:support@smartcalc.ai)  

---

## 1. Overview & Core Privacy Promise

**SmartCalc AI** is engineered from the ground up with a strict **privacy-by-design** architecture. We believe that your daily numbers, personal finances, budget calculations, and spoken voice commands belong solely to you.

> **Zero Data Collection Guarantee:** SmartCalc AI does not collect, log, track, sell, or transmit any user data, calculation records, or audio recordings to external cloud servers. All computations run 100% locally on your device.

---

## 2. Device Permissions & Why They Are Needed

To provide hands-free voice calculation and multi-tasking overlay features, SmartCalc AI requests the following explicit Android device permissions:

### A. Microphone (`android.permission.RECORD_AUDIO`)
- **Purpose:** Used exclusively when you activate voice calculation to convert spoken words into mathematical operations in real time.
- **Handling:** Audio is processed in memory on your device using Android's system speech recognizer (`android.speech.SpeechRecognizer`). We **never** save audio files to permanent storage, and we **never** upload your voice to any remote server or third-party cloud.
- **Duration:** Microphone listening automatically terminates after 3.5 seconds of silence or when you tap the mic button to stop.

### B. Display Over Other Apps (`android.permission.SYSTEM_ALERT_WINDOW`)
- **Purpose:** Used solely to enable the optional **Floating Overlay Mode**, allowing a compact calculator bubble to float over applications like WhatsApp, Amazon, or Excel.
- **Handling:** This permission is used solely to render the calculator window on your screen. The app does **not** read, capture, screenshot, or inspect any content from the underlying applications.

### C. Tactile Feedback (`android.permission.VIBRATE`)
- **Purpose:** Used to deliver crisp, hardware-accelerated tactile haptic feedback on keypad button presses.

---

## 3. Calculation Data & Local Storage

All calculations, custom variables, formulas, unit conversions, and history entries are saved strictly within your device's private sandboxed application storage (`AsyncStorage`).

- **No Accounts Required:** No user account or registration is required to use the app.
- **No Cloud Synchronization:** Your calculation history is never synced to the cloud.
- **User Control:** You can permanently wipe your calculation history at any time with a single tap using the "Clear All History" button in the app.

---

## 4. Third-Party Services & Tracking

SmartCalc AI contains:
- **NO** third-party analytics SDKs (no Firebase Analytics, Google Analytics, Mixpanel, etc.)
- **NO** advertising networks or ad trackers
- **NO** behavioral telemetry trackers
- **NO** data brokers

We do not track your location, your device identifiers, or your usage habits.

---

## 5. Children's Privacy (COPPA Compliance)

SmartCalc AI is completely safe for all audiences and does not collect any personal information from children under 13 years of age (or any age).

---

## 6. Data Security

Because all processing occurs strictly within the local Android OS sandbox without outbound network communication for calculations, your financial and computational data is naturally protected against interception, man-in-the-middle attacks, and remote server leaks.

---

## 7. Contact & Inquiries

If you have any questions, suggestions, or concerns regarding this Privacy Policy or SmartCalc AI, please contact the developer team at:

- **Email:** [support@smartcalc.ai](mailto:support@smartcalc.ai)
- **Repository:** [SmartCalc AI on GitHub](https://github.com/)

---
*© 2026 SmartCalc AI. Built with local on-device intelligence. All rights reserved.*
