# Validation status

The original privacy/history implementation was built successfully in all
three variants in GitHub Actions run 3:
https://github.com/mapix3/Telegram-iOS/actions/runs/36625187938

The installed client screenshots subsequently supplied by the user show that
the original history IPA runs on their device. They also show a local unread
badge problem when read reporting is suppressed.

## Follow-up build

Run 4 builds the follow-up patch after the original privacy/history patches:
https://github.com/mapix3/Telegram-iOS/actions/runs/36880392159

At the time this document was saved, this run had only been started. No new
compiled IPA or device validation was available. The earlier successful IPA
does not include these follow-up fixes.

Completed local checks:

- Nine CI helper unit tests passed.
- The follow-up patch applies cleanly to copies of all eleven original files.
- Applied files match the generated source byte for byte.
- A Swift syntax parser found no errors in the eleven changed files.
- The four new/updated build inputs on GitHub match the local files exactly.

Syntax parsing is not Swift type checking or a full application build. The CI
also invokes Apple's Swift parser before building the complete native app.

## Device checks still required

See AYUGRAM-FOLLOWUP.md for the eight device acceptance checks. In particular,
verify receipts using another Telegram account/device: local UI behavior alone
does not prove that no server receipt was sent. Test fresh view-once and timed
photos separately, including saving with Photos permission denied.

Secret-chat photo viewing, ephemeral videos, already expired media recovery,
and permanent automatic media archives are outside this follow-up.
