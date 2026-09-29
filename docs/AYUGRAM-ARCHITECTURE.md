# Архитектура и конкретные изменения

Исследован Swiftgram/Telegram-iOS `cf8b23beaaac4126a396337ac2d5be13f9f76b66` (master на момент загрузки).
Исходники получены из публичного архива; полноценного клона с submodules и Xcode в Windows нет. В CI checkout выполняется через Git с recursive submodules.

## Существующая архитектура

`Swiftgram/SGSimpleSettings/Sources/SimpleSettings.swift` содержит `SGSimpleSettings.shared`, defaults и Swiftgram-переключатели.
`UserDefaultsWrapper.swift` кеширует отдельные значения без общего атомарного снимка. Новые privacy-проверки вызываются из разных очередей, поэтому добавлен отдельный блок настроек **внутри этого же модуля и владельца**: `SGSimpleSettings.shared.ayuGram`.
Доступ `AyuGramSettings.shared` является алиасом к этому блоку, а не вторым независимым singleton. Хранилище — `UserDefaults.standard`, как у существующих обычных Swiftgram-настроек, одна Codable-запись с `NSLock` и уведомлением после освобождения lock.

`Swiftgram/SGSettingsUI` использует стандартные ItemListUI-компоненты через `SGItemListUI`. Новый экран следует этой схеме.
Корневой Settings в этой версии находится в `TelegramUI/Components/PeerInfo/PeerInfoScreen`, а не в старом `SettingsController.swift`.

`TelegramCore/BUILD` уже зависит от `SGSimpleSettings`. Оба модуля используют glob `Sources/**/*.swift`, поэтому новые файлы включаются без ручной регистрации. Новые UI-зависимости в TelegramCore не добавляются.

## Патч 01 — Privacy

Пути ниже относительно корня исходного Swiftgram.

| Файл | Изменение / назначение |
|---|---|
| `Swiftgram/SGSimpleSettings/Sources/AyuGramSettings.swift` | Новый атомарный snapshot, значения по умолчанию, эффективные Ghost Mode-флаги, уведомления |
| `Swiftgram/SGSimpleSettings/Sources/SimpleSettings.swift` | Владелец блока `ayuGram`, старые настройки и defaults не меняются |
| `Swiftgram/SGSettingsUI/Sources/AyuGramSettingsController.swift` | Нативные переключатели и объяснение ограничений |
| `submodules/TelegramUI/Components/PeerInfo/PeerInfoScreen/Sources/PeerInfoScreen.swift` | Новый case `ayuGramPrivacy` |
| `submodules/TelegramUI/Components/PeerInfo/PeerInfoScreen/Sources/PeerInfoScreenSettingsActions.swift` | Открытие нового экрана |
| `submodules/TelegramUI/Components/PeerInfo/PeerInfoScreen/Sources/PeerInfoSettingsItems.swift` | Строка Privacy рядом со Swiftgram |
| `submodules/TelegramCore/Sources/State/ManagedAccountPresence.swift` | `account.updateStatus`; преобразование запроса online в effective offline, реакция на настройки и отмена online timer |
| `submodules/TelegramCore/Sources/State/ManagedLocalInputActivities.swift` | `messages.setTyping` и `setEncryptedTyping`; подавление typing/sticker/game/emoji hints, recording и upload progress по группам |
| `submodules/TelegramCore/Sources/TelegramEngine/Messages/ApplyMaxReadIndexInteractively.swift` | Отказ от новых интерактивных read intents до изменения локальных максимумов, включая форумы |
| `submodules/TelegramCore/Sources/TelegramEngine/Messages/MarkAllChatsAsRead.swift` | Защита массового чтения, повторная проверка после асинхронного запроса |
| `submodules/TelegramCore/Sources/TelegramEngine/Messages/ReplyThreadHistory.swift` | `readDiscussion`, `readSavedHistory`; проверки в producer и перед отправкой |
| `submodules/TelegramCore/Sources/State/SynchronizePeerReadState.swift` | `messages.readHistory`, `channels.readHistory`, `readEncryptedHistory`; потребление несостоявшейся локальной синхронизации без запроса |
| `submodules/TelegramCore/Sources/State/ManagedConsumePersonalMessagesActions.swift` | Очереди content-read/mentions/reactions/poll-vote receipts |
| `submodules/TelegramCore/Sources/State/ManagedSynchronizeConsumeMessageContentsOperations.swift` | Очередь `messages/channels.readMessageContents` |
| `submodules/TelegramCore/Sources/State/ManagedSynchronizeMarkAllUnseenPersonalMessagesOperations.swift` | Массовые content-read, `readReactions`, `readPollVotes` |
| `submodules/TelegramCore/Sources/State/AccountViewTracker.swift` | Отметки просмотра live-location content |
| `submodules/TelegramCore/Sources/TelegramEngine/Messages/Stories.swift` | Producer просмотров, в том числе `incrementStoryViews` для pinned stories |
| `submodules/TelegramCore/Sources/State/ManagedSynchronizeViewStoriesOperations.swift` | `stories.readStories`, завершение заблокированной операции без ретраев |

Не изменяются транспорт MTProto, fetch updates, server `pts/qts`, загрузка/скачивание файлов, входящие read updates, call signaling.
Не формируются фиктивные `AffectedMessages` или `pts`. У очередей операций сохраняется их штатный путь удаления после completion; иначе блокировка запроса могла бы оставить постоянный retry.

Для основной read-state очереди возвращается текущее локальное состояние без сетевого запроса; существующий consumer снимает флаг локальной несинхронизированности. Это намеренное расхождение локального и серверного чтения. Новые интерактивные read intents блокируются ещё раньше.
Не обещается отмена уже созданных/отправленных сетевых операций. Проверки переходов во время retry/переподключения ещё необходимы на устройстве.

## Патч 02 — история текста

| Файл | Изменение |
|---|---|
| `submodules/TelegramCore/Sources/TelegramEngine/Messages/AyuGramMessageHistory.swift` | Account-local Postbox preferences, ограничение объёма, чтение/очистка через TelegramEngine |
| `submodules/TelegramCore/Sources/State/AccountStateManagementUtils.swift` | Снимок перед `EditMessage`, `DeleteMessages`, `DeleteMessagesWithGlobalIds` |
| `Swiftgram/SGSettingsUI/Sources/AyuGramSettingsController.swift` | Отдельное включение истории и переход к просмотру |
| `Swiftgram/SGSettingsUI/Sources/AyuGramHistoryController.swift` | Нативный список записей, названия чатов/авторы, очистка с подтверждением |

История записывается в той же Postbox-транзакции до замены/удаления оригинала. Используется `applicationSpecificPreferencesKey(0x415955)`; ключ не обнаружен в других модулях исследованной версии.
Записи не добавляются обратно в чат и не вмешиваются в применение серверных удалений. Не создаётся отдельный JSON-файл вне жизненного цикла аккаунта.
Предел: 200 записей, текст до 4096 символов; записи старше 30 дней очищаются при чтении или добавлении.
История по умолчанию выключена, Ghost Mode её не включает. Отключение не очищает существующие записи — это отдельное действие.

Покрытие ограничено уже загруженным текстом. Нет восстановления удалённого с сервера, архива медиа, secret chats, disappearing messages, перехвата всех операций удаления диапазонов, полного diff форматирования или отдельного снимка медиа-only edits.
Снимки edit записываются только при изменении текста; вспомогательные обновления reactions/счётчиков не раздувают историю.

## Сборка

Основные исследованные файлы:

- `versions.json`: Xcode 26.2, Bazel 8.4.2 и checksum.
- `build-system/Make/Make.py`: `generateProject` и `build`, цель `Telegram/Swiftgram`, путь IPA `bazel-bin/Telegram/Swiftgram.ipa`.
- `build-system/Make/ProjectGeneration.py`: `Telegram:Telegram_xcodeproj`, результат `Telegram/Swiftgram.xcodeproj`.
- `build-system/Make/BuildConfiguration.py`: обязательный `sg_config`, шаблон config, generated `variables.bzl`, XcodeManagedCodesigningSource.
- `Telegram/BUILD`: `disableProvisioningProfiles` selects, extensions и приложение.
- `rules_apple` commit `1791d916de4083388f22e20248d8b010d23f0d6b`, `apple/internal/codesigning_support.bzl`: feature `disable_legacy_signing` отключает codesigning до проверки обязательного profile.

У `Make.py --bazelArguments` в изученной версии есть parser option, но отсутствует использование аргумента. Поэтому дополнительные настройки временно добавляются в `.bazelrc`, чтобы действовать и на генерацию проекта, и на build. Файл восстанавливается в `finally`.
`--disableProvisioningProfiles` сам по себе не является подтверждённым способом unsigned device build: дополнительно нужен `disable_legacy_signing` в rules_apple.
`--xcodeManagedCodesigning` используется как существующий configuration provider без импорта чужих fake certificates. Реальные операции provisioning/signing отключаются выше в Bazel.
Генератор проекта может отключить extensions в сгенерированном IDE-проекте при XcodeManagedCodesigning. Полная IPA строится отдельной командой Make.py/Bazel с исходным списком extensions; флаг `disableExtensions` для неё не задаётся.

Полный путь на runner пока не выполнен. Статический анализ подтверждает наличие опций и путей в коде, а не факт успешной unsigned-сборки.

## Сохранение Swiftgram

Ни один существующий Swiftgram-переключатель, translation provider, transcription provider, context menu, tab layout, media quality option или upload/download boost не удаляется. Старые defaults не меняются: значения вроде Photo Quality 100% выбираются в существующих настройках Swiftgram.
Сохранение исходного кода функций не является подтверждением доступности платных/серверных сервисов при вашем API ID и пустом `sg_config`; их нужно проверить отдельно.
Штатный Save to Gallery для stories остаётся в `TelegramUI/Components/Stories/StoryContainerScreen/Sources/StoryItemSetContainerComponent.swift`.

Ссылки: [исследованный Swiftgram](https://github.com/Swiftgram/Telegram-iOS/tree/cf8b23beaaac4126a396337ac2d5be13f9f76b66), [закреплённый codesigning_support](https://github.com/ali-fareed/rules_apple/blob/1791d916de4083388f22e20248d8b010d23f0d6b/apple/internal/codesigning_support.bzl), [Telegram views/read semantics](https://core.telegram.org/api/views).
