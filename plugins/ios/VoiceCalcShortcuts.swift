import AppIntents

// Siri phrases, Spotlight and Action-button shortcuts for VoiceCalc AI.
// Copied into the main app target by plugins/withVoiceCalcAppIntents.js.
// The intents themselves live in targets/widget/SharedIntents.swift.

@available(iOS 16.0, *)
struct VoiceCalcShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CalculateIntent(),
            phrases: [
                "Calculate with \(.applicationName)",
                "Ask \(.applicationName)",
                "Do math with \(.applicationName)",
            ]
        )
        AppShortcut(
            intent: StartVoiceCalcIntent(),
            phrases: [
                "Start \(.applicationName)",
                "Open \(.applicationName) mic",
                "\(.applicationName) listen",
            ]
        )
    }
}
