# Client extras (patch 04)

This patch follows patches 01–03. The history build includes every patch.

## Local Premium

The AyuGram settings page has a Local Premium switch, off by default. It adds
the own-profile Premium badge and unlocks the custom emoji picker locally.
It does not change the account's actual Telegram subscription.

For newly sent cloud-chat messages and captions, custom emoji entities are
converted to ordinary emoji text with a TextUrl entity linking to
https://t.me/addemoji/PACK#ayuemoji_DOCUMENTID. The sender's client reconstructs
the animated custom emoji from that link when Local Premium is enabled.
Other clients receive regular emoji; tapping opens the corresponding pack.
Actual custom-emoji entities are not submitted by this conversion.

If the emoji document or pack is unavailable, the original ordinary emoji
text is retained without a link. Existing expired media cannot be recovered.
Forwarded messages and secret-chat messages do not undergo this conversion.
Adding new premium emoji while editing an existing message is not included.

Client preferences use a separate versioned storage key so updating them does
not reset existing privacy preferences.

## Pinned chats

The maximum pinned chats slider has integer values from 5 to 30, default 5.
When a root-list pin action occurs with a limit above 5, the existing pin order
is copied into account-local Postbox preferences. Thereafter this device's
root pin order is retained locally, including after server dialog updates and
restart. Pin synchronization for that root list is suppressed. Archive and
folder pin behavior is unchanged. Deleted or archived chats are pruned from
the local root pin order.

Cloud and secret chats count together toward the selected local limit.
Lowering the slider does not automatically unpin existing chats; new pinning
is blocked at the reduced limit. Existing chats can still be unpinned.

## Device acceptance checks

1. Start with previously saved Anti Read / Ghost settings. Enable Local
   Premium, change the slider, restart, and confirm both old and new settings.
2. Send multiple custom emoji in a cloud chat, including a formatted message
   and a media caption. Verify local animation after the server echo/restart.
3. On an ordinary Telegram client, verify ordinary emoji and a tappable link
   opening the correct pack; confirm the account remains non-Premium there.
4. Disable Local Premium and confirm the sent text/link remains readable.
5. Set 30, pin more than the server limit, reorder, receive a server update,
   and restart. Confirm the local order persists on this device.
6. Set 5 with more than 5 pins. Confirm no automatic unpinning, new pinning is
   blocked, and unpinning remains possible.
7. Archive/delete a pinned chat and confirm it disappears from root pins.
   Switch accounts and verify orders are not shared between accounts.
8. Repeat the read-receipt/media checks in AYUGRAM-FOLLOWUP.md. UI appearance
   alone does not establish server behavior; check with another account.

Full native compilation and these device checks are required before calling
this implementation validated. Local patch/syntax checks are preliminary.
