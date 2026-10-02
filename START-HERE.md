# AyuGram iOS: Standard и Custom без Mac

Подготовлено для Swiftgram/Telegram-iOS, commit `cf8b23beaaac4126a396337ac2d5be13f9f76b66`.
Это исходные патчи и CI, **не готовый IPA и не подтверждённая сборка**.
Локальный Mac не требуется: компилятор запускается на macOS runner в GitHub Actions.

Текущий комплект включает общие патчи 01–05, 07, 08 и 10; Custom дополнительно применяет 06 и 09. Workflow **AyuGram iOS — Standard + Custom** запускает две версии независимо. Подробности текущих функций и ограничений находятся в [REFINEMENTS.md](docs/REFINEMENTS.md); инструкции ниже про первые этапы сохраняются для диагностики исходной сборки.

Для полной актуальной сборки выберите `variant: both`, `stage: history`. Готовые основные файлы — `AyuGram-standard-unsigned.ipa` и `AyuGram-custom-unsigned.ipa`. Проверяйте `build-manifest.json`: наличие архива после завершения job само по себе не подтверждает, что последний этап успешно скомпилировался.

## Что уже сделано

- Два последовательных патча к существующему Swiftgram. Существующие функции и настройки Swiftgram остаются в исходниках.
- Отдельный экран **Settings → AyuGram / Privacy**, рядом со Swiftgram.
- Ghost Mode, Anti Read, Anti Online, Anti Typing, Anti Recording, Anti Uploading, Story Privacy.
- Локальная история прежнего текста отредактированных и удалённых сообщений, просмотр и очистка.
- Workflow с генерацией Xcode project и device IPA через Make.py/Bazel. Сборка останавливается при ошибке любого этапа.
- Секреты поступают из GitHub Secrets. В комплекте нет настоящего `api_hash`, сертификатов или provisioning profiles.

## 1. Создать форк

Откройте [Create fork](https://github.com/Swiftgram/Telegram-iOS/fork), войдите в GitHub, выберите свой аккаунт и нажмите **Create fork**.
Пришлите ссылку на созданный репозиторий, если хотите продолжить установку файлов и разбор сборки здесь.
Не нужно присылать пароль, GitHub token или `api_hash` в чат.

## 2. Загрузить файлы этого комплекта в форк

Распакуйте архив. В корне вашего форка должны появиться:

```text
.github/workflows/ayugram-ios.yml
scripts/ayugram_ci.py
patches/01-privacy.patch
patches/02-history.patch
scripts/ayugram-tests/AyuGramSettingsTests.swift
scripts/ayugram-tests/test_ci.py
docs/AYUGRAM-ARCHITECTURE.md
docs/AYUGRAM-VALIDATION.md
```

Через сайт GitHub можно воспользоваться **Add file → Upload files** для папок `scripts`, `patches` и `docs`.
Не загружайте архив вместо его содержимого: Actions нужны распакованные файлы по указанным путям.

Для workflow удобнее **Add file → Create new file**: введите полный путь `.github/workflows/ayugram-ios.yml`, вставьте содержимое одноимённого файла из комплекта и нажмите **Commit changes**.
Существующий upstream `.github/workflows/build.yml` оставьте; запускать нужно новый workflow **AyuGram iOS (unsigned)**.

## 3. Заполнить Secrets

В своём форке: **Settings → Secrets and variables → Actions → New repository secret**.

| Имя Secret | Значение |
|---|---|
| `TELEGRAM_API_ID` | `37347979` — API ID из вашего запроса |
| `TELEGRAM_API_HASH` | Ваш настоящий API hash из [my.telegram.org/apps](https://my.telegram.org/apps) |
| `APPLE_TEAM_ID` | `NV9296YQR5` — Team ID из вашего запроса |
| `APP_BUNDLE_ID` | `org.ayugram.ios10201020` |

Эти параметры не надо коммитить в JSON. Конфигурация создаётся внутри runner и удаляется после сборки.
API hash будет частью скомпилированного клиента, как и в обычном Telegram-клиенте; Secrets защищают его от попадания в исходники и явный вывод CI, а не от извлечения из распространяемого приложения.

## 4. Запустить сборку

Во вкладке **Actions** включите workflows, если GitHub предложит это. Выберите **AyuGram iOS (unsigned) → Run workflow**.

Параметр `stage`:

- `baseline`: только исходный Swiftgram. Полезен для первого выявления проблем runner/build system.
- `privacy`: сначала baseline, затем первый патч и повторная полная сборка.
- `history`: baseline → Privacy → Message History, полная сборка после каждого этапа. Это вариант по умолчанию.

Параметр `configuration`: `release_arm64` или `debug_arm64`. Оба предназначены для устройства, не симулятора.

Для воспроизводимости workflow берёт **именно проверенный выше commit публичного Swiftgram**, а патчи и CI — из вашего форка.
Он не собирает автоматически произвольные изменения Swift-файлов на вершине вашего форка. Когда патчи будут перенесены в постоянную ветку исходников, checkout и CI нужно будет переключить на её commit и убрать повторное применение патчей.

Внутри одного job сначала генерируется `Telegram/Swiftgram.xcodeproj`, затем Make.py собирает `Telegram/Swiftgram`. Готовый файл берётся из `bazel-bin/Telegram/Swiftgram.ipa`.
Состояние Bazel переиспользуется между этапами; дополнительный disk cache не создаётся, чтобы не дублировать большие результаты на диске runner.

## 5. Забрать результат

На странице запуска в разделе **Artifacts** скачайте `ayugram-unsigned-…`.
Внутри будут IPA успешно завершённых этапов и `build-manifest.json` с commit, версиями, SHA-256 и состоянием этапов.
Если следующий этап упал, предыдущий успешно собранный IPA сохраняется. Проверяйте поле `stage` и имя файла:

```text
Swiftgram-baseline-unsigned.ipa
Swiftgram-privacy-unsigned.ipa
Swiftgram-history-unsigned.ipa
```

**Unsigned IPA нельзя просто установить на обычный iPhone.** Его потребуется подписать отдельно подходящим сертификатом и профилями для приложения и расширений.
Apple Ad Hoc distribution и техническая подпись `codesign -s -` — разные вещи; этот workflow не выдаёт ни одно из них за installable signed IPA.
Signed workflow не включён в этот этап. Для него нужны ваши certificate/private key и подходящие provisioning profiles; хранить их нужно только в Secrets и временном keychain runner.

## Ресурсы runner и диагностика

В исследованном commit `versions.json` требует Xcode 26.2 и Bazel 8.4.2. Версии не подменяются и проверки не отключаются.
На проверенном образе `macos-26` есть Xcode 26.2. Наличие этой версии со временем может измениться; workflow завершится с понятной ошибкой, если она пропадёт.

Стандартный `macos-26` имеет ограниченные CPU/RAM/SSD. Успех большой сборки Telegram на нём пока не проверен. Ограничены параллельные задачи Bazel; в начале выводится свободное место.
Если лог покажет нехватку памяти, диска или времени, потребуется macOS runner с достаточными ресурсами. Его label можно задать repository variable `AYUGRAM_RUNNER`. Не меняйте label на платный вариант, не проверив условия вашего GitHub-плана.
Даже larger runner не обязательно имеет больший диск — это нужно проверить отдельно.

При ошибке пришлите ссылку на запуск и текст первого упавшего шага. Не вставляйте Secrets в лог вручную.

## Ограничения Privacy

- Все переключатели изначально выключены. Настройки общие для аккаунтов на этом устройстве; история разделена по аккаунтам.
- Ghost Mode временно включает сетевые ограничения, сохраняя индивидуальные значения переключателей. Он **не включает сбор истории**.
- Anti Read может оставлять чаты и темы непрочитанными. Будущее чтение после отключения режима может подтвердить более ранние сообщения из-за накопительной семантики Telegram.
- Уже отправленные запросы отменить нельзя; режим нужно включать заранее. Требуется отдельная проверка гонок с начатыми запросами и повторным подключением.
- Anti Online подавляет явный online status, но не гарантирует невидимость действий на сервере или активности других сессий.
- Anti Uploading скрывает индикатор для собеседника; передача файла продолжает работать.
- Story Privacy блокирует новые отметки просмотра в изученных путях. Он не удаляет просмотры, которые сервер уже получил, и не подменяет серверную Premium Stealth Mode.
- Сохранение stories остаётся штатным Swiftgram **Save to Gallery** там, где оно доступно. Обход ограничений этого меню не добавлен.
- Звонки остаются штатными: «невидимое принятие звонка» не реализовано. Для голосовых сообщений блокируются content-read receipts; другие эффекты требуют проверки на устройстве.
- История сохраняет только уже загруженный текст до полученной правки/удаления: до 200 записей по 4096 символов на аккаунт. Вложения, секретные и исчезающие сообщения исключены.
- История не восстанавливает то, чего на устройстве не было. Массовые удаления диапазонов и отдельные локальные удаления не покрыты. Подробнее — в архитектурном документе.
- Старые записи удаляются при открытии истории или добавлении новых через 30 дней; это не фоновый таймер удаления. Есть отдельная кнопка очистки с подтверждением.

Источники: [Swiftgram](https://github.com/Swiftgram/Telegram-iOS/tree/cf8b23beaaac4126a396337ac2d5be13f9f76b66), [образ macOS 26](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), [ресурсы hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [ресурсы larger runners](https://docs.github.com/en/actions/reference/runners/larger-runners).
