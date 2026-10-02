import json
from pathlib import Path
import subprocess


def check_receipts(source: Path):
    required = ['ServerPresence', 'ServerUnavailable', 'SendReadReceipt', 'ViewWithoutReceipt',
                'ReportPhotoView', 'View', 'SendReceipt', 'ReceiptSent', 'ReceiptError', 'ReadWarning', 'ViewWarning']
    locales = sorted((source / 'Swiftgram/SGStrings/Strings').glob('*.lproj/SGLocalizable.strings'))
    assert len(locales) == 37
    for file in locales:
        strings = json.loads(subprocess.check_output(['plutil', '-convert', 'json', '-o', '-', file], text=True))
        assert all(strings.get('Ayu.' + key, '').strip() for key in required), file
        assert strings['Ayu.ServerPresence'].count('%@') == 1, file
    text = (source / 'submodules/TelegramCore/Sources/TelegramEngine/Messages/AyuGramManualReceipts.swift').read_text()
    body = text.split('func _internal_ayuReportReadAfterSending(', 1)[1].split(' -> Signal<Bool, NoError> {', 1)[1]
    guard = body.split('    return ayuReportRead(', 1)[0].replace('return .single(false)', 'return false')
    fixture = '''
struct PeerId: Equatable { let value: Int }
struct MessageId { let peerId: PeerId; let namespace: Int }
enum Namespaces { enum Message { static let Cloud = 0 } }
final class AyuGramSettings {
    static let shared = AyuGramSettings()
    struct Snapshot { var suppressRead = true }
    var snapshot = Snapshot()
}
func shouldReport(accountPeerId: PeerId, messageId: MessageId) -> Bool {
''' + guard + '''
    return true
}
let own = PeerId(value: 1)
let target = PeerId(value: 2)
precondition(shouldReport(accountPeerId: own, messageId: MessageId(peerId: target, namespace: 0)))
precondition(!shouldReport(accountPeerId: own, messageId: MessageId(peerId: own, namespace: 0)))
precondition(!shouldReport(accountPeerId: own, messageId: MessageId(peerId: target, namespace: 1)))
precondition(!shouldReport(accountPeerId: own, messageId: MessageId(peerId: target, namespace: 2)))
AyuGramSettings.shared.snapshot.suppressRead = false
precondition(!shouldReport(accountPeerId: own, messageId: MessageId(peerId: target, namespace: 0)))
print("Send receipts exclude Saved Messages, non-cloud messages and disabled privacy")
'''
    output = source / 'build-input/ayu-receipt-checks'
    output.mkdir(parents=True, exist_ok=True)
    file = output / 'ReceiptPolicy.swift'
    file.write_text(fixture)
    binary = output / 'receipt-tests'
    subprocess.run(['xcrun', 'swiftc', '-swift-version', '5', '-warnings-as-errors', file, '-o', binary], check=True)
    subprocess.run([binary], check=True, timeout=10)
    print('Receipt strings validated in all 37 languages; production send guard passed', flush=True)
