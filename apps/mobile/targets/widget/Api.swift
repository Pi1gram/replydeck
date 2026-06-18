import Foundation

// MARK: - Model
// Mirrors the JSON returned by GET /email-cards?status=pending. Only the
// fields the widget renders are declared; Codable ignores the rest.
struct EmailCard: Codable, Identifiable {
    let id: String
    let fromName: String
    let subject: String
    let summary: String
    let draftReply: String
    let riskLevel: String        // "low" | "medium" | "high" (always lowercase)
    let confidenceScore: Double  // API may emit 0–1 (float) or 0–100 (int); normalize below

    /// Confidence as a whole-number percentage, robust to either encoding.
    var confidencePercent: Int {
        confidenceScore <= 1.0
            ? Int((confidenceScore * 100).rounded())
            : Int(confidenceScore.rounded())
    }

    var isHighRisk: Bool { riskLevel.lowercased() == "high" }

    /// Used for the widget gallery preview and placeholder.
    static let placeholder = EmailCard(
        id: "preview",
        fromName: "Mia Chen",
        subject: "Confirming Thursday 2pm design review",
        summary: "Mia is confirming the design review and asking if the mobile approval flow is still the focus.",
        draftReply: "Hi Mia, confirmed for Thursday 2pm. Let's keep the focus on the approval flow.",
        riskLevel: "low",
        confidenceScore: 0.96
    )
}

// MARK: - API client
enum EmailCardAPI {
    static let baseURL = URL(string: "https://replydeck-api.fly.dev")!
    static let userId = "cmozb3wxt0000epl11g97atj3"

    /// GET pending cards. Fails fast — widget execution budgets are tight.
    static func fetchPending() async throws -> [EmailCard] {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("email-cards"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [URLQueryItem(name: "status", value: "pending")]

        var request = URLRequest(
            url: components.url!,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 10
        )
        request.httpMethod = "GET"
        request.setValue(userId, forHTTPHeaderField: "x-user-id")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode([EmailCard].self, from: data)
    }

    /// POST /email-cards/:id/approve — sends the AI-drafted reply.
    /// The server rejects high-risk cards with 400, so the widget only
    /// surfaces this for non-high-risk cards.
    static func approve(id: String) async throws {
        let url = baseURL
            .appendingPathComponent("email-cards")
            .appendingPathComponent(id)
            .appendingPathComponent("approve")

        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue(userId, forHTTPHeaderField: "x-user-id")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}
