import AppIntents
import WidgetKit

// One-tap "Send" from the widget. Runs in the widget extension process
// (openAppWhenRun = false) so the reply sends without opening the app,
// then asks WidgetKit to refresh so the next card slides in.
struct ApproveTopCardIntent: AppIntent {
    static var title: LocalizedStringResource = "Send Reply"
    static var description = IntentDescription(
        "Approves and sends the AI-drafted reply for a pending ReplyDeck card."
    )
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Card ID")
    var cardID: String

    init() {}
    init(cardID: String) { self.cardID = cardID }

    func perform() async throws -> some IntentResult {
        try await EmailCardAPI.approve(id: cardID)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
