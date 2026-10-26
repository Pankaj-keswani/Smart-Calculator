import AppIntents
import Foundation

// This file is compiled into BOTH the widget extension and the main app
// (plugins/withVoiceCalcAppIntents.js copies it into the app target).
// Intents that open the app must exist in the app target so iOS can run them there.

/// Hands an action from Siri, Shortcuts, the Action button or Control Center to the
/// React Native app through the shared App Group. Read by src/utils/appleWidgets.ts.
enum VoiceCalcHandoff {
    static let appGroup = "group.app.voicecalcai"
    static let pendingKey = "pendingAction"

    static func post(action: String, query: String? = nil) {
        var payload: [String: Any] = [
            "action": action,
            "ts": Date().timeIntervalSince1970 * 1000,
        ]
        if let query = query {
            payload["q"] = query
        }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let defaults = UserDefaults(suiteName: appGroup)
        else { return }
        defaults.set(data, forKey: pendingKey)
    }
}

/// Opens VoiceCalc AI with the microphone listening.
@available(iOS 16.0, *)
struct StartVoiceCalcIntent: AppIntent {
    static var title: LocalizedStringResource = "Speak a Calculation"
    static var description = IntentDescription("Opens VoiceCalc AI with the microphone on, ready for your calculation.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        VoiceCalcHandoff.post(action: "voice")
        return .result()
    }
}

/// Siri asks "What should I calculate?", then VoiceCalc AI opens with the answer.
@available(iOS 16.0, *)
struct CalculateIntent: AppIntent {
    static var title: LocalizedStringResource = "Calculate"
    static var description = IntentDescription("Works out a calculation said in plain words, like “18 percent of 420” or “half of 3 lakh”.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Calculation", requestValueDialog: IntentDialog("What should I calculate?"))
    var expression: String

    func perform() async throws -> some IntentResult {
        VoiceCalcHandoff.post(action: "calc", query: expression)
        return .result()
    }
}
