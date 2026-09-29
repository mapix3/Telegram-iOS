# Состояние проверки

## Выполнено локально в Windows

- Проверены исходный commit, versions.json, Make.py, генератор проекта, Telegram/BUILD и закреплённый rules_apple codesigning support.
- Найдены producer/consumer paths read, typing, online, recording/upload indicators, story receipts.
- Патчи 01 и 02 применяются по порядку через `git apply --check` и `git apply` к неизменённым исходникам исследованного commit.
- 9 Python-тестов CI helper прошли: обязательные поля config, отсутствие значения секрета в диагностике, защита от внедрения кода в generated Starlark, границы API ID, структура IPA, отказ от simulator artifact, executable/bundle-id checks, удаление только generated credentials.
- Python-скрипты проходят `py_compile`.
- Четыре новых Swift source files проходят синтаксический разбор tree-sitter-swift. Это **не Swift type checking и не компиляция**.
- YAML workflow проходит синтаксический разбор. Фактический запуск GitHub Actions пока не выполнен.

## Подготовлено для выполнения в CI

- Foundation-only Swift-тесты persistence, Ghost Mode, сохранения индивидуальных флагов, отсутствия автоматического включения history, конкурентных обновлений и уведомления вне lock.
- Полная сборка базового Swiftgram, затем Privacy, затем History. При ошибке следующий этап не запускается.
- Проверка Info.plist IPA, device platform, executable и bundle identifier.
- SHA-256 результата и манифест успешно завершённых этапов.

## Ещё НЕ проверено

- Компиляция и линковка Swift/Bazel, работа XcodeParse при generateProject.
- Поддержка unsigned device packaging всей цепочкой зависимостей на runner.
- Достаточность CPU/RAM/диска стандартного runner.
- Установка и запуск на iPhone после отдельной подписи, корректность entitlements расширений.
- Поведение privacy с сервером, переключение во время уже начатого RPC, переподключение, работа нескольких сессий/аккаунтов, counters и push notifications.
- UI на iPhone/iPad, VoiceOver, длинные сообщения/названия, доступность Swiftgram-сервисов.
- Runtime-тесты Postbox-истории, удаления аккаунта и лимитов хранения.

## Проверка на двух тестовых аккаунтах после успешной сборки

| Сценарий | Ожидаемый результат / что проверить |
|---|---|
| Все flags off | Чтение, typing, presence, voice playback и stories ведут себя как baseline |
| Ghost on → off | Все сетевые ограничения включаются; прежние индивидуальные значения восстанавливаются |
| Anti Typing | Нет typing/sticker/emoji activity hints, отправка текста работает |
| Anti Recording / Uploading | Нет соответствующих индикаторов; запись и отправка файлов работают |
| Anti Online в foreground | Явный `updateStatus(offline:false)` не отправляется; отслеживать ограничения сервера |
| Anti Read, личный чат/группа/канал | Нет новых readHistory/content-read; unread UI может сохраняться |
| Forum/replies/mark all read | Не обходят Anti Read |
| Voice message + Anti Read | Нет content-read receipts; воспроизведение и скачивание работают |
| Secret chat | Проверить отсутствие read receipt, не поломаны ключи/синхронизация и countdown semantics |
| Pending operations + reconnect | Нет бесконечных retry и неконтролируемой отправки накопленных receipts; отдельно проверить уже начатые операции |
| Story обычная/pinned | Нет новых readStories/incrementStoryViews; ранее отправленные views не исчезают |
| History off | Новые снимки не создаются |
| History on, edit/delete | Старый загруженный текст появляется в истории текущего аккаунта, серверное изменение в чате применяется |
| Media-only, secret, disappearing | Не архивируются |
| Смена аккаунта / Clear history | Истории разделены; очистка после подтверждения удаляет записи только текущего аккаунта |
| Более 200 событий | Сохраняются последние 200, старые записи удаляются |

До прохождения этих проверок код следует считать экспериментальным, а утверждать полную невидимость или готовность к повседневному использованию нельзя.
