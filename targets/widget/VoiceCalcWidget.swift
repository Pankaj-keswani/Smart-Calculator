import SwiftUI
import WidgetKit

// Home screen + lock screen widget and Control Center button for VoiceCalc AI.
// The app writes the last answer to the shared App Group (src/utils/appleWidgets.ts).

private let appGroup = "group.app.voicecalcai"
private let gold = Color(red: 0.902, green: 0.816, blue: 0.106) // #E6D01B
private let ink = Color(red: 0.059, green: 0.059, blue: 0.059) // #0F0F0F
private let voiceURL = URL(string: "smartcalc://voice")!
private let keypadURL = URL(string: "smartcalc://keypad")!

// MARK: - Timeline

struct CalcEntry: TimelineEntry {
    let date: Date
    let expression: String
    let result: String
}

struct CalcProvider: TimelineProvider {
    func placeholder(in context: Context) -> CalcEntry {
        CalcEntry(date: Date(), expression: "18% × 420", result: "75.6")
    }

    func getSnapshot(in context: Context, completion: @escaping (CalcEntry) -> Void) {
        let entry = loadEntry()
        if context.isPreview && entry.result.isEmpty {
            completion(placeholder(in: context))
        } else {
            completion(entry)
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalcEntry>) -> Void) {
        // The app asks WidgetKit to reload after every new answer.
        completion(Timeline(entries: [loadEntry()], policy: .never))
    }

    private func loadEntry() -> CalcEntry {
        var expression = ""
        var result = ""
        if let data = UserDefaults(suiteName: appGroup)?.data(forKey: "lastResult"),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
            expression = object["expression"] as? String ?? ""
            result = object["result"] as? String ?? ""
        }
        return CalcEntry(date: Date(), expression: expression, result: result)
    }
}

// MARK: - Views

struct CalcWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CalcEntry

    private var hasResult: Bool { !entry.result.isEmpty }

    var body: some View {
        switch family {
        case .accessoryCircular:
            circular
        case .accessoryRectangular:
            rectangular
        case .accessoryInline:
            inline
        case .systemMedium:
            medium
        default:
            small
        }
    }

    private var micBadge: some View {
        Image(systemName: "mic.fill")
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(ink)
            .frame(width: 26, height: 26)
            .background(Circle().fill(gold))
    }

    private var header: some View {
        HStack(spacing: 6) {
            micBadge
            Text("VoiceCalc")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color.white.opacity(0.85))
        }
    }

    @ViewBuilder
    private var answer: some View {
        if hasResult {
            Text(entry.expression)
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundColor(Color.white.opacity(0.55))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(entry.result)
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
        } else {
            Text(verbatim: "Say “18% of 420”")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Color.white.opacity(0.9))
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            header
            Spacer(minLength: 0)
            answer
            Text("Tap to speak")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(gold)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(voiceURL)
    }

    private var medium: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                header
                Spacer(minLength: 0)
                answer
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)

            VStack(spacing: 8) {
                Link(destination: voiceURL) {
                    pill(icon: "mic.fill", title: "Speak", filled: true)
                }
                Link(destination: keypadURL) {
                    pill(icon: "circle.grid.3x3.fill", title: "Keypad", filled: false)
                }
            }
            .frame(width: 112)
        }
        .widgetURL(voiceURL)
    }

    private func pill(icon: String, title: String, filled: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
            Text(title)
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundColor(filled ? ink : Color.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(filled ? gold : Color.white.opacity(0.12))
        )
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: "mic.fill")
                .font(.system(size: 22, weight: .semibold))
        }
        .widgetURL(voiceURL)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label("VoiceCalc", systemImage: "mic.fill")
                .font(.system(size: 13, weight: .semibold))
            if hasResult {
                Text(entry.result)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            } else {
                Text("Tap to speak")
                    .font(.system(size: 15, weight: .medium))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(voiceURL)
    }

    private var inline: some View {
        let text: String = hasResult ? "= " + entry.result : "VoiceCalc: tap to speak"
        return Label(text, systemImage: "mic.fill")
            .widgetURL(voiceURL)
    }
}

// MARK: - Widgets

struct VoiceCalcWidget: Widget {
    let kind = "VoiceCalcWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CalcProvider()) { entry in
            CalcWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    ink
                }
        }
        .configurationDisplayName("VoiceCalc AI")
        .description("Your last answer, and one tap to speak a new calculation.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

/// Control Center / Lock Screen / Action button control (iOS 18).
struct VoiceCalcMicControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "app.voicecalcai.mic") {
            ControlWidgetButton(action: StartVoiceCalcIntent()) {
                Label("VoiceCalc Mic", systemImage: "mic.fill")
            }
        }
        .displayName("VoiceCalc Mic")
        .description("Opens VoiceCalc AI with the microphone on.")
    }
}

@main
struct VoiceCalcWidgetBundle: WidgetBundle {
    var body: some Widget {
        VoiceCalcWidget()
        VoiceCalcMicControl()
    }
}
