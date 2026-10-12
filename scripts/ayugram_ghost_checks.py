import json
import re
import subprocess
from pathlib import Path

NEW_KEYS = ['HeroGhostOn', 'HeroGhostOff', 'HeroHidden', 'GhostSubtitle', 'GhostFooter', 'HideSection', 'BehaviorSection',
            'OfflineAfterSending', 'OfflineAfterSendingInfo', 'ReadOnSend', 'ReadOnSendInfo', 'QuickToggle', 'QuickToggleInfo',
            'ContentSection', 'IgnoreProtection', 'IgnoreProtectionInfo', 'AllowScreenshots', 'AllowScreenshotsInfo', 'ContentFooter',
            'SaveDeletedInfo', 'OpenHistory', 'ClientSection', 'LocalPremiumInfo', 'GhostEnable', 'GhostDisable',
            'GhostEnabledToast', 'GhostDisabledToast', 'ChatListBackground', 'ConversationBackground', 'ChooseVideo', 'ShowBackground']


def check_strings(source: Path):
    locales = sorted((source / 'Swiftgram/SGStrings/Strings').glob('*.lproj/SGLocalizable.strings'))
    assert len(locales) == 37
    for file in locales:
        strings = json.loads(subprocess.check_output(['plutil', '-convert', 'json', '-o', '-', file], text=True))
        missing = [key for key in NEW_KEYS if not strings.get('Ayu.' + key, '').strip()]
        assert not missing, (file, missing)
        assert strings['Ayu.HeroHidden'].count('%@') == 2, file
        for key in NEW_KEYS:
            # i18n formats every string; a stray % would corrupt the text.
            assert '%' not in strings['Ayu.' + key].replace('%@', ''), (file, key)


def check_sources(source: Path, variant: str):
    settings = (source / 'Swiftgram/SGSimpleSettings/Sources/AyuGramSettings.swift').read_text()
    key = re.search(r'allowScreenshotsDefaultsKey = "([^"]+)"', settings).group(1)
    objc = (source / 'submodules/UIKitRuntimeUtils/Source/UIKitRuntimeUtils/UIKitUtils.m').read_text()
    assert '@"' + key + '"' in objc, 'Screenshot protection reads the mirrored option'
    player = (source / 'submodules/MediaPlayer/Sources/MediaPlayerNode.swift').read_text()
    assert '"' + key + '"' in player, 'Video layers read the mirrored option'
    enqueue = (source / 'submodules/TelegramCore/Sources/PendingMessages/EnqueueMessage.swift').read_text()
    assert 'ayuPrepareProtectedForwards(account: account, peerId: peerId, messages: messages)' in enqueue
    pending = (source / 'submodules/TelegramCore/Sources/State/PendingMessageManager.swift').read_text()
    assert pending.count('_internal_ayuAfterSending(') == 2 and '_internal_ayuReportReadAfterSending(' not in pending
    settings_action = (source / 'submodules/TelegramUI/Components/PeerInfo/PeerInfoScreen/Sources/PeerInfoScreenSettingsActions.swift').read_text()
    assert 'ayuGramSettingsScreen(context: self.context)' in settings_action
    chat_list = (source / 'submodules/ChatListUI/Sources/ChatListController.swift').read_text()
    assert 'AyuGramSettings.shared.setGhostMode(!ghostEnabled)' in chat_list
    assert '//Swiftgram/SGStrings:SGStrings' in (source / 'submodules/ChatListUI/BUILD').read_text()
    entry = (source / 'Swiftgram/SGSettingsUI/Sources/AyuGramAppearanceEntry.swift').read_text()
    assert ('= true' in entry) == (variant == 'custom'), 'Appearance link matches the variant'
    if variant == 'custom':
        backdrop = (source / 'submodules/Display/Source/AyuGramBackdropView.swift').read_text()
        assert 'AVPlayer' not in backdrop and 'AVQueuePlayer' not in backdrop, 'Wallpaper video must not use AVPlayer'
        assert 'AyuGramSilentVideoRenderer' in backdrop


def check_ghost_and_content(source: Path, variant: str):
    check_strings(source)
    check_sources(source, variant)
    print('Ghost Mode, content protection and settings strings validated in all 37 languages', flush=True)
