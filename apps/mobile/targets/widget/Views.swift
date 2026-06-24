import WidgetKit
import SwiftUI
import AppIntents

private let queueURL = URL(string: "replydeck://queue")!

// MARK: - Root view (branches per widget family)
struct ReplyDeckEntryView: View {
    var entry: ReplyDeckEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallView(entry: entry)
                .widgetURL(queueURL)
                .containerBackground(.fill.tertiary, for: .widget)

        case .systemMedium:
            MediumView(entry: entry)
                // .widgetURL is the fallback tap (outside the Send button).
                .widgetURL(queueURL)
                .containerBackground(.fill.tertiary, for: .widget)

        case .accessoryRectangular:
            AccessoryRectangularView(entry: entry)
                .widgetURL(queueURL)
                .containerBackground(for: .widget) { }

        case .accessoryCircular:
            AccessoryCircularView(entry: entry)
                .widgetURL(queueURL)
                .containerBackground(for: .widget) { }

        case .accessoryInline:
            AccessoryInlineView(entry: entry)
                .widgetURL(queueURL)
                .containerBackground(for: .widget) { }

        @unknown default:
            EmptyView()
        }
    }
}

// MARK: - Home screen: small
struct SmallView: View {
    let entry: ReplyDeckEntry

    var body: some View {
        if let card = entry.topCard {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: riskSymbol(card.riskLevel))
                        .foregroundStyle(riskColor(card.riskLevel))
                        .font(.caption)
                    Text(riskLabel(card.riskLevel))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(card.confidencePercent)%")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                Text(card.fromName)
                    .font(.headline)
                    .lineLimit(1)
                Text(card.subject)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Spacer(minLength: 0)
                Text(entry.remainingCount > 0 ? "+\(entry.remainingCount) more · tap to triage" : "Tap to triage")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
        } else {
            InboxClearView(compact: true)
        }
    }
}

// MARK: - Home screen: medium (with one-tap Send)
struct MediumView: View {
    let entry: ReplyDeckEntry

    var body: some View {
        if let card = entry.topCard {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 5) {
                        Image(systemName: riskSymbol(card.riskLevel))
                            .foregroundStyle(riskColor(card.riskLevel))
                            .font(.caption)
                        Text(card.fromName)
                            .font(.headline)
                            .lineLimit(1)
                    }
                    Text(card.subject)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(card.summary)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(2)
                    if entry.remainingCount > 0 {
                        Text("+\(entry.remainingCount) more in queue")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }

                Spacer(minLength: 6)

                VStack(spacing: 6) {
                    Text("\(card.confidencePercent)%")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if card.isHighRisk {
                        // Trust spine: high-risk replies cannot be one-tap sent.
                        VStack(spacing: 2) {
                            Image(systemName: "lock.fill").font(.body)
                            Text("Review").font(.caption2)
                        }
                        .foregroundStyle(.orange)
                    } else {
                        Button(intent: ApproveTopCardIntent(cardID: card.id)) {
                            Label("Send", systemImage: "paperplane.fill")
                                .font(.caption2)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                    }
                }
                .frame(width: 78)
            }
            .padding(14)
        } else {
            InboxClearView(compact: false)
        }
    }
}

// MARK: - Lock screen: rectangular
struct AccessoryRectangularView: View {
    let entry: ReplyDeckEntry

    var body: some View {
        if let card = entry.topCard {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Image(systemName: riskSymbol(card.riskLevel))
                        .widgetAccentable()
                    Text(card.fromName)
                        .font(.headline)
                        .lineLimit(1)
                }
                Text(card.subject)
                    .font(.caption)
                    .lineLimit(1)
                Text(card.summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        } else {
            Label("Inbox clear", systemImage: "tray")
                .font(.caption)
        }
    }
}

// MARK: - Lock screen: circular
struct AccessoryCircularView: View {
    let entry: ReplyDeckEntry

    var body: some View {
        if let card = entry.topCard {
            VStack(spacing: 1) {
                Image(systemName: riskSymbol(card.riskLevel))
                    .font(.title3)
                    .widgetAccentable()
                Text("\(entry.remainingCount + 1)")
                    .font(.caption2)
                    .fontWeight(.semibold)
            }
        } else {
            Image(systemName: "tray").font(.title3)
        }
    }
}

// MARK: - Lock screen: inline
struct AccessoryInlineView: View {
    let entry: ReplyDeckEntry

    var body: some View {
        if let card = entry.topCard {
            ViewThatFits {
                Label("\(card.fromName): \(card.subject)", systemImage: riskSymbol(card.riskLevel))
                Label(card.fromName, systemImage: riskSymbol(card.riskLevel))
                Label("1 pending reply", systemImage: "envelope")
            }
        } else {
            Label("Inbox clear", systemImage: "tray")
        }
    }
}

// MARK: - Empty state
struct InboxClearView: View {
    let compact: Bool

    var body: some View {
        if compact {
            VStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.green)
                Text("Inbox clear")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } else {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Inbox clear").font(.headline)
                    Text("No replies waiting").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

// MARK: - Risk helpers
func riskSymbol(_ level: String) -> String {
    switch level.lowercased() {
    case "high":   return "exclamationmark.triangle.fill"
    case "medium": return "exclamationmark.circle.fill"
    default:       return "checkmark.circle.fill"
    }
}

// Color only renders on the home screen (.fullColor). On the lock screen the
// system desaturates to vibrant/monochrome, so risk is also conveyed by symbol.
func riskColor(_ level: String) -> Color {
    switch level.lowercased() {
    case "high":   return .red
    case "medium": return .orange
    default:       return .green
    }
}

func riskLabel(_ level: String) -> String {
    switch level.lowercased() {
    case "high":   return "High risk"
    case "medium": return "Medium"
    default:       return "Low risk"
    }
}
