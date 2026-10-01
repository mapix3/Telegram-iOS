# Validation status

The original privacy/history implementation was built successfully in all
three variants in GitHub Actions run 3:
https://github.com/mapix3/Telegram-iOS/actions/runs/36625187938

The installed client screenshots subsequently supplied by the user show that
the original history IPA runs on their device. They also show a local unread
badge problem when read reporting is suppressed.

## Follow-up build

Run 5 builds patch 03 after the original privacy/history patches:
https://github.com/mapix3/Telegram-iOS/actions/runs/36881402751

Run 4 was canceled early to add a missing MtProtoKit import for RPC error types.

The additional Local Premium / emoji link / local pins patch 04 is now included
in the history build inputs. Run 5 predates patch 04 and will be superseded by
a build of the updated inputs. No compiled IPA or device validation of patch 04
is available yet. The earlier successful IPA does not include patches 03–04.

Completed local checks:

- Nine CI helper unit tests passed.
- The follow-up patch applies cleanly to copies of all eleven original files.
- Applied files match the generated source byte for byte.
- A Swift syntax parser found no errors in the eleven changed files.
- Patch 04 applies exactly to all twenty changed files. Syntax parsing found
  no new errors relative to the unchanged originals (one original complex file
  has five pre-existing parser errors).
- Foundation tests for the new settings storage are included in CI.

Syntax parsing is not Swift type checking or a full application build. The CI
also invokes Apple's Swift parser before building the complete native app.

## Device checks still required

See AYUGRAM-FOLLOWUP.md and AYUGRAM-CLIENT-EXTRAS.md for device checks. In particular,
verify receipts using another Telegram account/device: local UI behavior alone
does not prove that no server receipt was sent. Test fresh view-once and timed
photos separately, including saving with Photos permission denied.

Secret-chat photo viewing, ephemeral videos, already expired media recovery,
and permanent automatic media archives are outside this follow-up.
