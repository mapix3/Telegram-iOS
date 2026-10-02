import re
import subprocess
from pathlib import Path


def check_custom_compatibility(source: Path):
    minimum = re.search(r'^minimum_os_version\s*=\s*"([0-9.]+)"', (source / 'Telegram/BUILD').read_text(), re.M)
    if not minimum:
        raise ValueError('Minimum iOS version is missing')
    output = source / 'build-input/ayu-compatibility'
    output.mkdir(parents=True, exist_ok=True)
    paths = [
        'Swiftgram/SGSettingsUI/Sources/AyuGramAppearanceController.swift',
        'Swiftgram/SGSimpleSettings/Sources/AyuGramAppearance.swift',
        'submodules/Display/Source/AyuGramBackdropView.swift',
    ]
    preview = source / 'Swiftgram/SGSettingsUI/Sources/AyuGramAppearancePreviewItem.swift'
    if preview.exists():
        paths.append(preview.relative_to(source).as_posix())
    inputs = []
    controller = (source / paths[0]).read_text()
    keys = sorted(set(re.findall(r'\bstrings\.([A-Za-z0-9_]+)', controller + (preview.read_text() if preview.exists() else ''))))
    # Application presentation/list contracts are stubbed; media APIs use their real source and iOS SDK.
    declarations = 'struct PresentationStrings {\n' + ''.join(f'    var {key}: String {{ "{key}" }}\n' for key in keys) + '}\n'
    declarations += '''struct CompatibilityPresentationData { var strings = PresentationStrings() }
struct CompatibilityValue { func with<T>(_ f: (CompatibilityPresentationData) -> T) -> T { f(CompatibilityPresentationData()) } }
struct CompatibilitySharedContext { var currentPresentationData = CompatibilityValue() }
final class AccountContext { var sharedContext = CompatibilitySharedContext() }
func i18n(_ key: String, _ language: String) -> String { key }
'''
    if preview.exists():
        declarations += '''
typealias ItemListSectionId = Int32
protocol ListViewItem {}
protocol ItemListItem { var sectionId: ItemListSectionId { get } }
struct ListViewItemLayoutParams { let width: CGFloat; let leftInset: CGFloat; let rightInset: CGFloat }
struct ListViewItemNodeLayout { let contentSize: CGSize; let insets: UIEdgeInsets }
struct ListViewItemApply {}
struct ListViewItemUpdateAnimation {}
class ListViewItemNode {
    let view = UIView()
    var contentSize = CGSize.zero
    var insets = UIEdgeInsets.zero
    init(layerBacked: Bool) {}
}
enum NoError: Error {}
final class Signal<T, E: Error> {}
final class Queue {
    static func mainQueue() -> Queue { Queue() }
    func async(_ f: @escaping () -> Void) { f() }
}
struct CompatibilityCheckColors { var foregroundColor: UIColor { .white } }
struct CompatibilityListTheme {
    var itemAccentColor: UIColor { .purple }
    var itemPrimaryTextColor: UIColor { .label }
    var blocksBackgroundColor: UIColor { .systemBackground }
    var itemBlocksBackgroundColor: UIColor { .secondarySystemBackground }
    var itemCheckColors = CompatibilityCheckColors()
}
struct CompatibilityTheme { var list = CompatibilityListTheme() }
struct ItemListPresentationData { var theme = CompatibilityTheme(); var strings = PresentationStrings() }
'''
        declarations = 'import UIKit\n' + declarations
    stubs = output / 'ApplicationContext.swift'
    stubs.write_text(declarations)
    inputs.append(stubs)
    for relative in paths:
        text = (source / relative).read_text()
        if relative == paths[0] and 'private final class AyuGramAppearanceMediaPicker' in text:
            text = 'import Foundation\nimport UIKit\nimport PhotosUI\n' + text[text.index('private final class AyuGramAppearanceMediaPicker'):]
        text = re.sub(r'^import (?:Display|AccountContext|TelegramPresentationData|SGSimpleSettings|SGStrings|SwiftSignalKit|ItemListUI)\n', '', text, flags=re.M)
        target = output / Path(relative).name
        target.write_text(text)
        inputs.append(target)
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphoneos', '--show-sdk-path'], text=True).strip()
    subprocess.run(['xcrun', 'swiftc', '-swift-version', '5', '-warnings-as-errors', '-target', 'arm64-apple-ios' + minimum.group(1), '-sdk', sdk, '-typecheck', *map(str, inputs)], check=True)
    print('Custom appearance SDK compatibility checked at iOS ' + minimum.group(1), flush=True)
    check_scoped_wallpapers(source, output)


def check_scoped_wallpapers(source: Path, output: Path):
    model = (source / 'Swiftgram/SGSimpleSettings/Sources/AyuGramAppearance.swift').read_text()
    if 'AyuGramAppearanceScope' not in model:
        return
    tests = model + '''
func expect(_ value: @autoclosure () -> Bool, _ message: String) { precondition(value(), message) }
let suite = "AyuAppearanceTests." + UUID().uuidString
let defaults = UserDefaults(suiteName: suite)!
let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
defer {
    defaults.removePersistentDomain(forName: suite)
    try? FileManager.default.removeItem(at: root)
}
let directory = root.appendingPathComponent("media")
let store = AyuGramAppearance(defaults: defaults, directory: directory)
let legacy = Data(#"{"fileName":"legacy.jpg","isVideo":false,"chatList":true,"conversations":true,"dim":0.6,"blur":0.2,"rowOpacity":0.65,"animateVideo":true}"#.utf8)
defaults.set(legacy, forKey: "swiftgram.ayuGram.appearance.v1")
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
try Data([1, 2, 3]).write(to: directory.appendingPathComponent("legacy.jpg"))
expect(store.effectiveSettings(for: .conversation).fileName == "legacy.jpg", "Existing backgrounds migrate")
store.updateForScope(.chatList) { $0.dim = 0.75 }
expect(store.effectiveSettings(for: .conversation).dim == 0.6, "List adjustment preserves existing conversation")
let file = root.appendingPathComponent("input.jpg")
try Data([4, 5, 6]).write(to: file)
try store.importMedia(file, isVideo: false, scope: .chatList)
let listURL = store.mediaURL(for: .chatList)!
expect(store.mediaURL(for: .conversation)?.lastPathComponent == "legacy.jpg", "List import preserves old conversation file")
expect(FileManager.default.fileExists(atPath: directory.appendingPathComponent("legacy.jpg").path), "Shared legacy image is not removed")
try store.importMedia(file, isVideo: false, scope: .conversation)
let wallpaperURL = store.mediaURL(for: .conversation)!
expect(wallpaperURL != listURL && store.mediaURL(for: .chatList) == listURL, "Conversation import is independent")
store.updateForScope(.conversation) { $0.dim = -5; $0.blur = 8 }
expect(store.effectiveSettings(for: .conversation).dim == 0.2 && store.effectiveSettings(for: .conversation).blur == 1, "Effect ranges clamp")
store.reset(scope: .chatList)
expect(store.mediaURL(for: .chatList) == nil && store.mediaURL(for: .conversation) == wallpaperURL, "List reset preserves wallpaper")
expect(!FileManager.default.fileExists(atPath: listURL.path) && FileManager.default.fileExists(atPath: wallpaperURL.path), "Reset removes only unused file")
store.reset(scope: .conversation)
expect(store.mediaURL(for: .conversation) == nil, "Conversation reset restores native wallpaper")
store.updateForScope(.chatList) { $0.fileName = "../escape.jpg" }
expect(store.mediaURL(for: .chatList) == nil, "Invalid media path cannot escape directory")
let empty = root.appendingPathComponent("empty.jpg")
try Data().write(to: empty)
do { try store.importMedia(empty, isVideo: false); preconditionFailure("Empty media must be rejected") } catch {}
let persisted = AyuGramAppearance(defaults: defaults, directory: directory)
expect(persisted.settings == store.settings, "Scoped settings survive restart")
print("Appearance migration, independent media, effect ranges, restart and file cleanup passed")
'''
    tests_path = output / 'AppearanceTests.swift'
    tests_path.write_text(tests)
    binary = output / 'appearance-tests'
    subprocess.run(['xcrun', 'swiftc', '-swift-version', '5', '-warnings-as-errors', tests_path, '-o', binary], check=True)
    subprocess.run([binary], check=True)
