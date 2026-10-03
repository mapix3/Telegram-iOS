import Foundation

final class SGSimpleSettings {
    static let shared = SGSimpleSettings()
    let ayuGram = AyuGramSettings(defaults: UserDefaults(suiteName: "AyuBadgeTests.Settings." + UUID().uuidString)!)
}

final class BadgeProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (Int, [String: Any]))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let result = Self.handler(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: result.0, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: result.1))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
    static func body(_ request: URLRequest) -> [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var bytes = [UInt8](repeating: 0, count: 4096)
            while true {
                let count = stream.read(&bytes, maxLength: bytes.count)
                precondition(count >= 0)
                if count == 0 { break }
                data.append(contentsOf: bytes.prefix(count))
            }
        }
        return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
    }
}

@main
struct ClientBadgeTests {
    static func expect(_ value: @autoclosure () -> Bool, _ text: String) { precondition(value(), text) }
    static func wait(_ text: String, until condition: () -> Bool) {
        let end = Date().addingTimeInterval(4)
        while !condition() && Date() < end { _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01)) }
        expect(condition(), text)
    }
    static func main() {
        let lock = NSLock()
        var calls: [String] = []
        BadgeProtocol.handler = { request in
            lock.lock(); defer { lock.unlock() }
            let path = request.url!.path
            calls.append(path)
            expect(request.url!.scheme == "https" && request.url!.host == "ayugram-sync.ayugram-status.workers.dev", "Badge requests use the pinned HTTPS service")
            expect(request.httpMethod == "POST" && request.value(forHTTPHeaderField: "Authorization") == nil, "No bot session or bearer credential is sent")
            let body = BadgeProtocol.body(request)
            if path == "/v2/members/register" {
                expect(Set(body.keys) == Set(["telegramId"]), "Registration sends only a public Telegram ID")
                return (200, ["telegramId": body["telegramId"]!, "registered": true])
            }
            expect(path == "/v2/members/lookup" && Set(body.keys) == Set(["ids"]), "Lookup cannot publish Premium or emoji")
            let ids = body["ids"] as! [String]
            return (200, ["members": ids.map { ["telegramId": $0, "registered": $0 == "999"] as [String: Any] }])
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [BadgeProtocol.self]
        let session = URLSession(configuration: configuration)
        let suite = "AyuBadgeTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite); session.invalidateAndCancel() }
        let badges = AyuGramClientBadges(defaults: defaults, session: session, startTimer: false)
        badges.setForeground(false)
        badges.observe(peerId: 999, accountId: 123)
        badges.setActiveAccount(123)
        expect(badges.badge(peerId: 123) == "member" && badges.badge(peerId: 999) == nil, "Own badge appears after Telegram login; peers wait for registry")
        expect(badges.badge(peerId: 1272887902) == "owner" && badges.badge(peerId: -1) == nil, "Owner glyph is distinct; invalid IDs have no badge")
        lock.lock(); expect(calls.isEmpty, "Background does not start requests"); lock.unlock()
        AyuGramSettings.shared.updateClient { $0.localPremium = true }
        AyuGramSettings.shared.setLocalStatus(peerId: 123, status: AyuGramLocalStatus(fileId: 99, expirationDate: nil))
        badges.setForeground(true)
        wait("Registration completes without authentication") { badges.refresh(); return badges.generation(peerId: 123) >= 2 }
        wait("Other registered clients receive the member badge") { badges.refresh(); return badges.badge(peerId: 999) == "member" }
        expect(AyuGramSettings.shared.client.localPremium && AyuGramSettings.shared.localStatus(peerId: 123)?.fileId == 99, "Registry never overwrites local Premium or status")
        let restarted = AyuGramClientBadges(defaults: defaults, session: session, startTimer: false)
        expect(restarted.badge(peerId: 999) == "member", "Peer badges persist across restart")
        badges.setForeground(false)
        badges.setActiveAccount(456)
        expect(badges.badge(peerId: 456) == "member" && badges.badge(peerId: 123) == "member", "Account switch preserves registered memberships")
        lock.lock()
        expect(calls.allSatisfy { $0.hasPrefix("/v2/members/") }, "No old authentication or fake Premium API remains")
        lock.unlock()
        let wrongSuite = suite + ".wrong"
        let wrongDefaults = UserDefaults(suiteName: wrongSuite)!
        defer { wrongDefaults.removePersistentDomain(forName: wrongSuite) }
        BadgeProtocol.handler = { _ in (200, ["telegramId": "999", "registered": true]) }
        let invalid = AyuGramClientBadges(defaults: wrongDefaults, session: session, startTimer: false)
        invalid.setActiveAccount(321)
        let end = Date().addingTimeInterval(0.2)
        while Date() < end { _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01)) }
        expect(invalid.generation(peerId: 321) == 1 && invalid.badge(peerId: 999) == nil, "Wrong-account response cannot add a peer badge")
        expect(wrongDefaults.data(forKey: "ayugram.client-badges.cache.v1") == nil, "Rejected response is not persisted")
        print("Automatic membership, account switch, cache, response isolation, foreground and local Premium separation passed")
    }
}
