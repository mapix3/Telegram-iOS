import Foundation

// Isolate the new Foundation-only store from unrelated application dependencies.
final class SGSimpleSettings {
    static let shared = SGSimpleSettings()
    let ayuGram = AyuGramSettings()
}

@main
struct AyuGramSettingsTests {
    static func main() {
        let suite = "AyuGramTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = AyuGramSettings(defaults: defaults)
        assert(store.snapshot == AyuGramPrivacySettings())
        store.update { $0.antiTyping = true; $0.ghostMode = true }
        let ghost = store.snapshot
        assert(ghost.suppressRead && ghost.suppressOnline && ghost.suppressTyping)
        assert(ghost.suppressRecording && ghost.suppressUploading && ghost.suppressStoryViews)
        assert(!ghost.messageHistory, "Ghost Mode must never opt into keeping message content")
        store.update { $0.ghostMode = false }
        assert(store.snapshot.suppressTyping && !store.snapshot.suppressRead)
        assert(AyuGramSettings(defaults: defaults).snapshot == store.snapshot)

        // Concurrent modifications of distinct fields must not overwrite one another.
        DispatchQueue.concurrentPerform(iterations: 4) { index in
            store.update { value in
                switch index {
                case 0: value.antiRead = true
                case 1: value.antiOnline = true
                case 2: value.antiRecording = true
                default: value.antiUploading = true
                }
            }
        }
        assert(store.snapshot.suppressRead && store.snapshot.suppressOnline)
        assert(store.snapshot.suppressRecording && store.snapshot.suppressUploading)
        var observed = false
        let observer = NotificationCenter.default.addObserver(forName: AyuGramSettings.didChange, object: nil, queue: nil) { _ in
            // This would deadlock if changes were published while holding the store lock.
            observed = store.snapshot.storyPrivacy
        }
        store.update { $0.storyPrivacy = true }
        NotificationCenter.default.removeObserver(observer)
        assert(observed)
        print("AyuGram settings: persistence, Ghost Mode, concurrency and observer tests passed")
    }
}
