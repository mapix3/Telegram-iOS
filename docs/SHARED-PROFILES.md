# AyuGram client badges

Standard and Custom automatically register the currently signed-in Telegram account's public user ID with https://ayugram-sync.ayugram-status.workers.dev. No bot, separate login, phone number or username is required. The client never sends fake Premium choices, emoji statuses, Telegram credentials, contacts or chat history.

The member badge is a purple outlined circle with a plane; owner ID 1272887902 keeps the separate filled seal. Updated AyuGram clients display badges after the Telegram Premium/status glyph in profiles, chat titles, chat rows and author headers. Ordinary Telegram clients cannot display these overlays.

This is an unauthenticated membership registry, not proof of account ownership. Registration grants no Telegram permissions, cannot modify protected profiles and cannot assign an owner role. Legacy profile APIs retain their authentication and are unused by the new client.

Fake Premium and fake emoji status are local preferences again. Patch 15 removes the old profile-sync client and its remote status overrides; patch 16 removes the bot connection section from settings. Native Telegram Premium and status data keep their original backing values.

Recently visible IDs are looked up in batches of up to 100 once per minute while active. The client bounds visible IDs to 256 and cached results to 512, backs off for 5–300 seconds after errors, rejects HTTP redirects and ignores responses after account switching. Model getters only read cached data. Registration retries automatically. Until it reaches the service, the account's own badge appears locally but cannot be looked up by others.

CI compiles the production Foundation client, runs its HTTP fixture and typechecks it against the minimum iOS SDK. Tests cover automatic registration, other clients' badges, persistence, account switching, wrong-account responses, foreground behaviour and separation from local Premium. Two-account device testing is still required to confirm rendered UI behaviour.
