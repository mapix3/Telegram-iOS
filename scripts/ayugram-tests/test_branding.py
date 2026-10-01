import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('ayugram_branding', Path(__file__).resolve().parents[1] / 'ayugram_branding.py')
branding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(branding)


class BrandingArtifactTests(unittest.TestCase):
    def ipa(self, path, name='AyuGram', icons=True):
        info = {'CFBundleDisplayName': name}
        if icons:
            info['CFBundleIcons'] = {'CFBundleAlternateIcons': {key: {} for key in ['AyuClassic', 'AyuPurple', 'AyuRed']}}
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('Payload/Telegram.app/Info.plist', plistlib.dumps(info))
        return path

    def test_expected_branding(self):
        with tempfile.TemporaryDirectory() as tmp:
            branding.verify_branding_ipa(self.ipa(Path(tmp) / 'app.ipa'))

    def test_missing_alternates_fail_delivery(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'alternate icons'):
                branding.verify_branding_ipa(self.ipa(Path(tmp) / 'app.ipa', icons=False))

    def test_wrong_display_name_fails_delivery(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'display name'):
                branding.verify_branding_ipa(self.ipa(Path(tmp) / 'app.ipa', name='Swiftgram'))
