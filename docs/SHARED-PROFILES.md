# Shared AyuGram profiles

Both Standard and Custom use `https://ayugram-sync.ayugram-status.workers.dev` and `@ayugrampremiumfakerbot`.

Open AyuGram settings → Shared profile → Connect account. The client opens a short-lived bot link for the currently signed-in Telegram ID. Start the bot and confirm the account, then return to AyuGram. Each installation needs its own confirmation. Once connected, fake Premium and the selected emoji status are read from the shared account profile; changing them explicitly publishes a new revision. Connecting does not upload old DataFolder preferences.

The member badge is an outlined purple circle with a plane. The owner ID 1272887902 has a separate filled seal. Updated AyuGram clients show these badges after the normal Telegram Premium/status glyph in profiles, chat titles, chat rows and message author names. Ordinary Telegram clients do not display these overlays. Real Telegram Premium continues to use Telegram's native status and API permissions.

The client refreshes its own profile and visible users at most once per minute while in the foreground. It requests batches of up to 100 visible IDs, caches public profiles for offline rendering, and updates native peer views through a local generation marker. Model getters do not start network requests. Disappearing status deadlines refresh the visible model as they expire. Network failures use a backoff of 5–60 seconds.

Each installation's bearer token is stored in the system Keychain and scoped to an installation UUID and Telegram ID. Public profile caches contain no bearer tokens. Account switching cancels requests and ignores late responses from the previous account. HTTP redirects are rejected. A revision conflict loads the newer remote profile instead of overwriting it. Disconnect revokes this installation only; it preserves the shared member profile.

The server stores Telegram ID, the chosen badge/status metadata and hashed session/link tokens. It does not receive phone numbers, Telegram session credentials, contacts or chat history. BOT_TOKEN and the webhook secret remain encrypted Cloudflare variables and are absent from this repository and the IPA.

Patch 11 supplies the common model and rendering hooks. Patch 12 has one settings-controller version per build variant. The new settings strings cover all 37 shipped SGStrings languages and follow the application language.

CI compiles and runs the production Foundation/Security synchronization client against a local HTTP fixture before the full Bazel build. Checks cover bot identity, 64-bit emoji IDs, cache notifications, rapid selections, a remote revision conflict, logout and a second installation. The complete application still requires a successful device build and an on-device two-account check.
