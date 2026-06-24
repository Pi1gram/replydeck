import WidgetKit
import SwiftUI

// MARK: - Entry point
@main
struct ReplyDeckWidgetBundle: WidgetBundle {
    var body: some Widget {
        ReplyDeckWidget()
    }
}

// MARK: - Timeline entry
struct ReplyDeckEntry: TimelineEntry {
    let date: Date
    let topCard: EmailCard?
    let remainingCount: Int
}

// MARK: - Timeline provider (fetches pending cards from the API)
struct ReplyDeckProvider: TimelineProvider {
    func placeholder(in context: Context) -> ReplyDeckEntry {
        ReplyDeckEntry(date: .now, topCard: .placeholder, remainingCount: 2)
    }

    func getSnapshot(in context: Context, completion: @escaping (ReplyDeckEntry) -> Void) {
        if context.isPreview {
            completion(ReplyDeckEntry(date: .now, topCard: .placeholder, remainingCount: 2))
        } else {
            Task { completion(await Self.makeEntry()) }
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ReplyDeckEntry>) -> Void) {
        Task {
            let entry = await Self.makeEntry()
            // Refresh ~15 min out; the app/intent can also force-refresh sooner
            // via WidgetCenter.reloadAllTimelines().
            let next = Date.now.addingTimeInterval(15 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    static func makeEntry() async -> ReplyDeckEntry {
        do {
            let cards = try await EmailCardAPI.fetchPending()
            guard let top = cards.first else {
                return ReplyDeckEntry(date: .now, topCard: nil, remainingCount: 0)
            }
            return ReplyDeckEntry(date: .now, topCard: top, remainingCount: max(0, cards.count - 1))
        } catch {
            // Network/decoding failure → show the calm "inbox clear" state
            // rather than leaving the widget blank.
            return ReplyDeckEntry(date: .now, topCard: nil, remainingCount: 0)
        }
    }
}

// MARK: - Widget declaration
struct ReplyDeckWidget: Widget {
    let kind = "ReplyDeckWidget"

    var body: some WidgetConfiguration {
        // StaticConfiguration is correct for an action-only widget (no
        // user-configurable parameters). Button(intent:) works here on iOS 17+.
        StaticConfiguration(kind: kind, provider: ReplyDeckProvider()) { entry in
            ReplyDeckEntryView(entry: entry)
        }
        .configurationDisplayName("ReplyDeck")
        .description("See and send your next AI-drafted reply.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,
            .accessoryCircular,
            .accessoryInline,
        ])
    }
}
