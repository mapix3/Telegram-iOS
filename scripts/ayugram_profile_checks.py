from pathlib import Path
import re
import subprocess


def check_shared_profiles(source: Path, ci: Path):
    output = source / 'build-input/ayu-profile-checks'
    output.mkdir(parents=True, exist_ok=True)
    model = source / 'Swiftgram/SGSimpleSettings/Sources/AyuGramSettings.swift'
    sync = source / 'Swiftgram/SGSimpleSettings/Sources/AyuGramClientBadges.swift'
    tests = ci / 'scripts/ayugram-tests/AyuGramClientBadgesTests.swift'
    binary = output / 'profile-tests'
    subprocess.run(['xcrun', 'swiftc', '-swift-version', '5', '-warnings-as-errors', model, sync, tests, '-o', binary], check=True)
    subprocess.run([binary], check=True, timeout=40)
    minimum = re.search(r'^minimum_os_version\s*=\s*"([0-9.]+)"', (source / 'Telegram/BUILD').read_text(), re.M).group(1)
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphoneos', '--show-sdk-path'], text=True).strip()
    stub = output / 'SettingsStub.swift'
    stub.write_text('import Foundation\nfinal class SGSimpleSettings { static let shared = SGSimpleSettings(); let ayuGram = AyuGramSettings() }\n')
    subprocess.run(['xcrun', 'swiftc', '-swift-version', '5', '-warnings-as-errors', '-target', 'arm64-apple-ios' + minimum, '-sdk', sdk,
                    '-typecheck', model, sync, stub], check=True)
    print('Automatic badge client checked with real Foundation and the minimum iOS SDK', flush=True)
