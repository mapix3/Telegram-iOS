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
    inputs = []
    controller = (source / paths[0]).read_text()
    keys = sorted(set(re.findall(r'\bstrings\.([A-Za-z0-9_]+)', controller)))
    # Only app context/localization are stubbed; UIKit, PhotosUI, storage and playback use their real source and SDK.
    declarations = 'struct PresentationStrings {\n' + ''.join(f'    var {key}: String {{ "{key}" }}\n' for key in keys) + '}\n'
    declarations += '''struct CompatibilityPresentationData { var strings = PresentationStrings() }
struct CompatibilityValue { func with<T>(_ f: (CompatibilityPresentationData) -> T) -> T { f(CompatibilityPresentationData()) } }
struct CompatibilitySharedContext { var currentPresentationData = CompatibilityValue() }
final class AccountContext { var sharedContext = CompatibilitySharedContext() }
func i18n(_ key: String, _ language: String) -> String { key }
'''
    stubs = output / 'ApplicationContext.swift'
    stubs.write_text(declarations)
    inputs.append(stubs)
    for relative in paths:
        text = (source / relative).read_text()
        text = re.sub(r'^import (?:Display|AccountContext|TelegramPresentationData|SGSimpleSettings|SGStrings)\n', '', text, flags=re.M)
        target = output / Path(relative).name
        target.write_text(text)
        inputs.append(target)
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphoneos', '--show-sdk-path'], text=True).strip()
    subprocess.run(['xcrun', 'swiftc', '-swift-version', '5', '-warnings-as-errors', '-target', 'arm64-apple-ios' + minimum.group(1), '-sdk', sdk, '-typecheck', *map(str, inputs)], check=True)
    print('Custom appearance SDK compatibility checked at iOS ' + minimum.group(1), flush=True)
