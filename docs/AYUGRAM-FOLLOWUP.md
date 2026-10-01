# Local read state, explicit receipts and private photo viewing

This follow-up applies after `01-privacy.patch` and `02-history.patch`, against
the same audited Swiftgram source commit. It is included in the `history` IPA.
The previous three-stage build succeeded; this follow-up requires a new build
and iPhone validation. A successful compile is not a device/network test.

## Local read state

With Anti Read or Ghost Mode active, opening/scrolling a conversation updates
Postbox's incoming read position, unread count and marked-unread state locally.
The Postbox write does not create a read-state synchronization operation.
The existing server-facing guard remains in place for older queued work.
Forum/reply-thread local positions can also advance without sending their RPCs.
Outgoing checkmarks keep their normal meaning: delivery/read by the recipient.
Other devices retain the server's unread state. Re-enabling normal read reports
can reveal earlier reads because Telegram's readHistory max ID is cumulative.

## Explicit receipt controls

Incoming cloud messages have an “Отправить отчёт о прочтении” context-menu item.
The confirmation explains the cumulative effect on earlier messages.
The action sends the appropriate history/discussion RPC directly for this
account/message. It does not toggle a global setting or flush a queued batch.
Success is shown only after a successful RPC response; failure does not claim
delivery. Secret-chat messages are not offered this manual cloud receipt item.

## Self-destructing photos

When Anti Read/Ghost Mode is active, incoming cloud-user photos with lifetime
attributes open in a standalone normal gallery using a display-only message
copy. Postbox keeps the real message's lifetime attributes unchanged. The
viewer does not invoke the secret-media preview's automatic content receipt.
Photo saving is available through the standard gallery and message context
menu, using the native download/Photos permission flow. This is local saving;
no photo is forwarded to Saved Messages or another recipient.

The separate “Сообщить о просмотре фото” action confirms the expiry consequence,
sends readMessageContents, and only then starts native local consumption. This
may expire a view-once photo immediately. Already expired/deleted media cannot
be recovered. Secret-chat media, ephemeral videos/voice messages, and automatic
permanent media archives are outside this photo-viewing implementation.

## Own server presence

The settings/profile header queries users.getUsers(inputUserSelf), formats the
returned presence with Telegram's native presence strings, and shows it beneath
the existing username/phone line. It refreshes approximately every 30 seconds
while the header is on screen and displays an unavailable state on failure.
The status is a server snapshot, not a fabricated foreground/online value;
different recipients' last-seen privacy permissions can show a coarser status.

## Device acceptance checks

1. Enable Anti Read; receive two messages and open the conversation. Local chat
   and tab counts clear; the sender must still see unread on another device.
2. Restart the client; counts remain cleared. A new message adds one unread.
3. Scroll only part of a longer chat; messages not reached remain unread locally.
4. Use the explicit read-report item; the sender sees read through the selected
   message. A new message remains private afterward; no global toggle changes.
5. Receive a fresh self-destructing photo, open twice and save to Photos. The
   sender must not get a content-view receipt or start the timer from those acts.
6. Use the explicit photo-view report. Confirm native expiry begins; test
   view-once and timed photos separately. Test refusal of Photos permission.
7. Toggle Anti Online and compare the own presence line with another session.
8. Keep normal Swiftgram forwarding, calls, account switching and settings
   working. Verify with both direct installation and LiveContainer if used.
