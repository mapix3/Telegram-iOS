# AyuGram: Standard and Custom

Both variants use the same audited Swiftgram source and common patches 01–05, 07, 08 and 10. Custom additionally applies patches 06 and 09. GitHub Actions starts two independent, concurrent full iPhone arm64 builds. A failure of one job does not cancel the other.

## Common changes

- Local root-chat pins use a keyed Postbox Codable object. A top-level Int64 array was encoded as Int64Array and never read by PreferencesEntry.get, which only decodes Object. The local list previously disappeared from the application's perspective and it reverted to Telegram's 5/10 pin limit. Pins remain device-local after increasing the slider.
- Real Telegram Premium accounts preserve native custom emoji when sending. The ordinary-emoji/pack-link conversion only runs for non-Premium accounts that enable Local Premium.
- Pack-link previews are disabled when converting emoji. Receiving clients replace AyuGram marker links with animated emoji for display, independently of their own Local Premium setting; raw entities remain available for network serialization. Existing matching pack previews are hidden in the bubble content renderer.
- Emoji packs and emoji search honour Local Premium. Premium stickers and other paid server entitlements are unchanged.
- Non-Premium local emoji statuses persist separately by account and survive subsequent Telegram peer updates. Native peer serialization and paid-account status changes continue using the actual server status.
- Message History has per-account chat selection using the native folder-style multiselection controller and search. Collection starts only after choosing chats. Already cached ordinary photos are copied before the deletion update removes their cache resource. Secret, disappearing and copy-protected messages are excluded. Uncached photos cannot be recovered.
- Remote deletions preserve selected, already received ordinary messages at their original ID and timestamp with a local trash marker. The Postbox deletion flag preserves the incoming direction while excluding these messages from unread counts; normal local deletion remains available. Repeated server deletion updates do not decrement thread statistics repeatedly. Stale refreshes cannot resurrect a retained deletion.
- Edited messages show a collapsible original-message quote in the bubble. The message menu opens its complete captured edit history. The rendered quote does not alter the network message text or its entities; reply-quote selection is disabled on this local annotation.
- History displays message cards with the changed text, previous version, author/profile action, source-chat action, photo previews, video playback and document previews. Author IDs and original timestamps are saved for new entries; older text-only archives remain readable.
- History remains bounded to 200 entries and 30 days, with a 200 MB archive budget and 20 MB per archived item. Cached ordinary photos, video and files are copied; unavailable media cannot be recovered. Pruning and clearing also remove retained deleted messages and archive files.
- New labels, old privacy menus and receipt confirmations follow the selected app language. AyuGram translations are bundled for all 37 Swiftgram locales; unsupported third-party language codes use the existing English fallback. Telegram's native picker/action strings use its language pack.
- The application name and top pill use AyuGram branding. The main settings retain a separate Swiftgram row for the original Swiftgram options, followed by an AyuGram row with the purple plane icon for this client's options. The native Privacy and Security row remains separate.
- The three user-supplied icons are available in Appearance. Icon selection is saved locally and drives both the settings selection and the top pill across page changes and restarts. The client also requests the native Home Screen icon change and reports an iOS refusal without discarding the local selection. Container-hosted installations may require configuring their Home Screen icon in the host separately.
- A separate purple plane owner badge is displayed for immutable Telegram user ID 1272887902 (@distressedx2x) after the Premium/status icon in profile, chat header, chat list and message author headers. Names remain unchanged. The top pill draws a foreground plane over a stretched dark plane watermark using the selected icon colour.

## Custom only

Appearance uses native Swiftgram grouped rows and pushed navigation with a back button. Switches, sliders and actions follow the current theme. A live preview shows the selected photo/video with its current effects and sample text. Sliders expose their actual bounds: dimming 20–90%, blur 0–100% and chat row opacity 35–100%.

The chat list and conversation wallpaper have separate media, dimming, blur and motion settings. Existing installations keep their previous shared background in both places until changing one scope. Replacing or resetting either scope preserves the other scope's file. Conversation customization is also accessible through the native Appearance → Wallpapers page. Resetting the conversation customization restores the native Telegram wallpaper.

Pinned and ordinary chat rows use the same backdrop opacity. Embedded message rows, including the profile's personal-channel card, retain their native transparent background. Changing a setting refreshes existing list rows immediately, including when the presentation theme has not changed.

Video is muted and pauses when detached, in the background, with Reduce Motion or with Low Power Mode. A still frame remains visible when motion is disabled. The first video frame and downsampled photo are prepared off the main thread; images are limited to 1536 pixels for the background renderer. Media stays inside the application container and is excluded from cloud backup. Imports are limited to 100 MB.

## Shared identities and statuses

Automatic recognition of every account logged in through this client, and sharing fake statuses with other installations, are not implemented by these patches. Telegram does not supply a client-membership registry. These features require a deployed authenticated registry and an explicit participation choice. No IDs or statuses are transmitted to a registry in this build. The local owner badge does work across installations because its immutable ID is included in the client.

## Validation

Local validation checks patch application from the exact base commit, changed Swift syntax against original sources, native string references, all 37 locale dictionaries, workflow matrix and CI helper tests. Each native build parses all final changed Swift sources, tests archive migration, unread/direction flags, path containment, record cap and expiry, and typechecks the badge, archive cards and media viewers against the actual iOS 13 SDK. Custom additionally checks the real picker/playback/preview APIs against the minimum iOS SDK and runs isolated Foundation tests for background migration, independent imports/resets, range bounds, persistence and media cleanup. It then generates the full project and builds the complete app with Bazel. Artifact verification checks alternate icon references and the 120/180-pixel PNG assets, including Apple-optimized PNG headers. Successful compilation does not establish device behaviour; the reported runtime bugs still need verification on an iPhone.

Artifacts: `AyuGram-standard-unsigned.ipa` and `AyuGram-custom-unsigned.ipa`. They use the configured bundle identifier and are alternative versions of the same app. They require signing/import into the user's installation setup.
