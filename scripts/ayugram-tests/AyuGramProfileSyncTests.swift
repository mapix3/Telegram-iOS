import Foundation

final class SGSimpleSettings {
    static let shared = SGSimpleSettings()
    let ayuGram = AyuGramSettings(defaults: UserDefaults(suiteName: "AyuProfileTests.Settings." + UUID().uuidString)!)
}

final class MemoryTokenStore: AyuGramProfileTokenStore {
    var values: [String: String] = [:]
    func read(accountId: Int64, installationId: String) -> String? { values["\(installationId).\(accountId)"] }
    func write(_ token: String?, accountId: Int64, installationId: String) -> Bool {
        values["\(installationId).\(accountId)"] = token
        return true
    }
}

final class ProfileProtocol: URLProtocol {
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

    static func body(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { preconditionFailure("Missing fixture request body") }
        stream.open()
        defer { stream.close() }
        var body = Data()
        var bytes = [UInt8](repeating: 0, count: 4096)
        while true {
            let count = stream.read(&bytes, maxLength: 4096)
            precondition(count >= 0, "Fixture body stream is readable")
            if count == 0 { break }
            body.append(contentsOf: bytes.prefix(count))
        }
        return body
    }
}

final class NotificationCount: @unchecked Sendable { var value = 0 }

@main
struct ProfileSyncTests {
    static func expect(_ value: @autoclosure () -> Bool, _ message: String) { precondition(value(), message) }
    static func wait(_ message: String, seconds: TimeInterval = 4, until condition: () -> Bool) {
        let end = Date().addingTimeInterval(seconds)
        while !condition() && Date() < end { _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01)) }
        expect(condition(), message)
    }
    static func main() throws {
        let apiLock = NSLock()
        var count = 0, writes = 0
        let expiry = Int64(Date().timeIntervalSince1970) + 300
        let token = String(repeating: "a", count: 64)
        var own: [String: Any] = ["telegramId": "123", "registered": true, "badge": "member", "fakePremium": false,
                                 "emojiId": NSNull(), "statusUntil": NSNull(), "revision": 0, "updatedAt": 1]
        let foreign: [String: Any] = ["telegramId": "999", "registered": true, "badge": "member", "fakePremium": true,
                                     "emojiId": "9223372036854775806", "statusUntil": NSNull(), "revision": 1, "updatedAt": 2]
        ProfileProtocol.handler = { request in
            apiLock.lock(); defer { apiLock.unlock() }
            count += 1
            expect(request.url!.host == "ayugram-sync.ayugram-status.workers.dev", "Requests stay on the configured service")
            let path = request.url!.path
            if path == "/v1/auth/start" {
                expect(request.value(forHTTPHeaderField: "Authorization") == nil, "Link start sends no bearer token")
                return (200, ["pollToken": String(repeating: "b", count: 64), "startUrl": "https://t.me/ayugrampremiumfakerbot?start=" + String(repeating: "c", count: 64), "expiresAt": expiry])
            }
            if path == "/v1/auth/poll" {
                return (200, ["token": token, "telegramId": "123", "expiresAt": expiry + 1000])
            }
            if request.value(forHTTPHeaderField: "Authorization") != "Bearer " + token { return (401, ["error": "invalid_session"]) }
            if path == "/v1/me", request.httpMethod == "PUT" {
                writes += 1
                let body = try! JSONSerialization.jsonObject(with: ProfileProtocol.body(of: request)) as! [String: Any]
                if body["expectedRevision"] as! Int != own["revision"] as! Int { return (409, ["profile": own]) }
                own["fakePremium"] = body["fakePremium"]
                own["emojiId"] = body["emojiId"]
                own["statusUntil"] = body["statusUntil"]
                own["revision"] = (own["revision"] as! Int) + 1
                own["updatedAt"] = (own["updatedAt"] as! Int) + 1
                return (200, own)
            }
            if path == "/v1/me" { return (200, own) }
            if path == "/v1/profiles/lookup" { return (200, ["profiles": [foreign], "serverTime": expiry - 300]) }
            if path == "/v1/session" { return (200, ["ok": true]) }
            preconditionFailure("Unexpected API request")
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProfileProtocol.self]
        let session = URLSession(configuration: configuration)
        let suite = "AyuProfileTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        let secondSuite = suite + ".second"
        let secondDefaults = UserDefaults(suiteName: secondSuite)!
        defer { defaults.removePersistentDomain(forName: suite); secondDefaults.removePersistentDomain(forName: secondSuite); session.invalidateAndCancel() }
        let tokens = MemoryTokenStore()
        defaults.set("installation-one", forKey: "ayugram.shared-profiles.installation.v1")
        expect(tokens.write(token, accountId: 123, installationId: "installation-one"), "Session fixture is stored")
        let sync = AyuGramProfileSync(defaults: defaults, tokenStore: tokens, session: session)
        let notifications = NotificationCount()
        let observer = NotificationCenter.default.addObserver(forName: AyuGramProfileSync.didChange, object: sync, queue: .main) { notification in
            if !(notification.userInfo?["peerIds"] as! [Int64]).isEmpty { notifications.value += 1 }
        }
        defer { NotificationCenter.default.removeObserver(observer) }
        sync.observe(peerId: 999, accountId: 123)
        wait("Visible peers receive a shared badge and exact 64-bit status") { sync.profile(peerId: 999) != nil }
        expect(sync.badge(peerId: 999) == "member" && sync.badge(peerId: 1272887902) == "owner", "Owner and member badges remain distinct")
        expect(sync.profile(peerId: 999)?.localStatus?.fileId == 9223372036854775806, "Emoji identifiers never round through floating point")
        expect(sync.generation(peerId: 999) > 0 && notifications.value > 0, "Profile changes notify native peer views")
        apiLock.lock(); let readsBefore = count; apiLock.unlock()
        for _ in 0..<500 { _ = sync.profile(peerId: 999); _ = sync.generation(peerId: 999) }
        apiLock.lock(); expect(count == readsBefore, "Model getters perform no network requests"); apiLock.unlock()
        let previousGeneration = sync.generation(peerId: 123)
        sync.publish(accountId: 123, fakePremium: true, status: AyuGramLocalStatus(fileId: 42, expirationDate: nil))
        sync.publish(accountId: 123, fakePremium: true, status: AyuGramLocalStatus(fileId: 43, expirationDate: nil))
        wait("Rapid status choices publish the latest explicit selection") { sync.profile(peerId: 123)?.emojiId == "43" && sync.state(accountId: 123) == "connected" }
        expect(sync.generation(peerId: 123) > previousGeneration, "Saved status refreshes native peer equality")
        apiLock.lock(); own["revision"] = (own["revision"] as! Int) + 1; own["emojiId"] = "99"; apiLock.unlock()
        sync.publish(accountId: 123, fakePremium: true, status: AyuGramLocalStatus(fileId: 44, expirationDate: nil))
        wait("A stale write loads the other device's authoritative selection") { sync.state(accountId: 123) == "conflict" }
        expect(sync.profile(peerId: 123)?.emojiId == "99", "Conflict does not overwrite a newer remote status")
        sync.disconnect(accountId: 123)
        wait("Disconnect revokes only this installation's session") { !sync.isConnected(accountId: 123) }
        expect(tokens.read(accountId: 123, installationId: "installation-one") == nil, "Disconnected bearer token is removed")
        expect(sync.profile(peerId: 123)?.registered == true, "Disconnecting a device preserves the public member profile")
        let cached = defaults.data(forKey: "ayugram.shared-profiles.cache.v1")!
        expect(!String(data: cached, encoding: .utf8)!.contains(token), "Profile cache never contains bearer tokens")
        let second = AyuGramProfileSync(defaults: secondDefaults, tokenStore: tokens, session: session)
        AyuGramSettings.shared.updateClient { $0.localPremium = false }
        var link: URL?
        second.beginAuthentication(accountId: 123) { link = $0 }
        wait("New data folders receive a pinned bot confirmation link") { link != nil }
        expect(!second.isConnected(accountId: 123), "No session exists before bot confirmation")
        wait("Confirmed second installation fetches the existing account profile") { second.profile(peerId: 123)?.emojiId == "99" }
        expect(second.hasPremium(peerId: 123) && AyuGramSettings.shared.client.localPremium, "Remote Premium selection survives changing data folders")
        apiLock.lock(); expect(writes == 3, "Connecting never uploads stale local settings"); apiLock.unlock()
        second.setActiveAccount(123)
        second.observe(peerId: 999, accountId: 456)
        let selectionApplied = NotificationCount()
        DispatchQueue.main.async { selectionApplied.value = 1 }
        wait("Primary selection is applied before inactive views refresh") { selectionApplied.value == 1 }
        expect(second.isConnected(accountId: 123) && AyuGramSettings.shared.client.localPremium, "Inactive views cannot switch the synchronization account")
        second.setActiveAccount(456)
        second.observe(peerId: 999, accountId: 456)
        wait("An unconfirmed different account does not inherit authorization") { second.state(accountId: 456) == "disconnected" && !AyuGramSettings.shared.client.localPremium }
        expect(!second.isConnected(accountId: 456) && !AyuGramSettings.shared.client.localPremium, "Account switch resets account-specific Premium")
        second.beginAuthentication(accountId: 456) { _ in }
        wait("A bot response for the wrong Telegram ID is rejected") { second.state(accountId: 456) == "error" }
        expect(!second.isConnected(accountId: 456) && second.profile(peerId: 456) == nil, "Wrong-account confirmation grants no token or profile")
        print("Shared profile verification, cache, rapid edits, conflict, logout and data-folder isolation passed")
    }
}
