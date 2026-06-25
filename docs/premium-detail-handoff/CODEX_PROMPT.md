# CODEX PROMPT — CRM24 Premium Detail UI

## Контекст

Нужно сделать CRM24 визуально сильной. Проблема не только в цветах, а в мелочах: кнопки, поля, карточки, dropdown, drawer, меню «Ещё», чат, видеокружки, почта, поддержка, wide-screen layout.

Сейчас Codex слишком часто делает старую CRM с перекрашенными карточками. Это не принимается.

## Главная цель

Сначала собрать отдельный визуальный preview, где каждая мелочь выглядит премиально. Только после принятия preview переносить внешний вид в рабочие разделы CRM.

Создать route или dev-only страницу:

```text
/ui-preview
```

На `/ui-preview` должны быть собраны:

- sidebar;
- topbar;
- кнопки;
- input states;
- badges;
- cards;
- lead row;
- lead card;
- statistic cards;
- drawer;
- bottom sheet «Ещё»;
- chat bubbles;
- chat composer;
- voice message;
- video circle;
- recording circle;
- mail item;
- support dialog item;
- dark theme;
- mobile layout.

## Жёсткие ограничения

Не менять без отдельного разрешения:

- авторизацию;
- API;
- backend;
- роли;
- статусы;
- business logic;
- текущие рабочие сценарии;
- drill-down статистики;
- действия лидов;
- комментарии;
- чат/voice/video логику.

Разрешено менять:

- layout;
- стили;
- компоненты UI;
- классы;
- responsive;
- motion;
- визуальную иерархию;
- форму отображения существующих данных.

## Критерий провала

Если после работы интерфейс визуально похож на старый интерфейс с другими цветами — задача не выполнена.

Если в мобильной версии есть горизонтальный скролл у лидов — задача не выполнена.

Если меню «Ещё» выглядит как странный input/dropdown — задача не выполнена.

Если при записи видеокружка не видно, что происходит — задача не выполнена.

Если drawer имеет грязный серый backdrop — задача не выполнена.

## Этап 1. Design tokens

Создать или привести к единой системе:

- semantic light tokens;
- semantic dark tokens;
- admin tokens;
- chat tokens;
- mail tokens;
- support tokens;
- overlay tokens;
- radius scale;
- shadow scale;
- typography scale;
- spacing scale;
- z-index layers;
- motion durations/easings.

Aqua/cyan — акцент, а не заливка всего экрана.

Светлая тема должна быть чистой, дорогой, с мягкими карточками.

Тёмная тема должна быть отдельной темой, а не инверсией светлой.

## Этап 2. Micro components

Сначала сделать компоненты, не страницы:

- Button;
- IconButton;
- Input;
- Textarea;
- SecretInput;
- Switch;
- Badge;
- FilterChip;
- SearchBar;
- Card;
- StatCard;
- DataTableRow;
- LeadCard;
- SidebarItem;
- Topbar;
- BottomNav;
- MoreSheet;
- Drawer;
- Dialog;
- Dropdown;
- ChatBubble;
- ChatComposer;
- VoiceMessage;
- VideoCircle;
- RecordingCircle;
- MailItem;
- MailReader;
- MailComposer;
- SupportDialogItem;
- SupportCompanyPanel.

Проверить их в `/ui-preview`.

Каждый компонент должен иметь состояния:

- default;
- hover;
- pressed;
- focus-visible;
- disabled;
- loading, где нужно;
- empty/error, где нужно.

## Этап 3. CRM shell

Собрать новый shell:

- desktop sidebar;
- topbar;
- mobile header;
- mobile bottom nav;
- красивый bottom sheet «Ещё»;
- wide-screen workbench;
- chat dock справа на широких экранах.

На 1920px+ рабочий раздел и чат должны использовать пространство как нормальный workbench.

На 1280px чат должен быть обычным разделом.

На mobile — bottom nav + отдельный чат.

## Этап 4. Лиды

Сделать лиды удобными и красивыми.

Требования:

- desktop: таблица или compact grid без визуального мусора;
- tablet/mobile: карточки без горизонтального скролла;
- фильтры и поиск должны быть красивыми;
- действия лида сохранить;
- комментарии сохранить;
- назначение ответственного сохранить;
- смену статуса сохранить;
- экспорт сохранить;
- empty/loading states сделать красиво.

## Этап 5. Статистика

Сохранить текущий важный сценарий:

```text
сотрудник -> стадия -> конкретные лиды
```

Нельзя убрать drill-down ради красивого макета.

Статистика должна показывать:

- пульс продаж;
- лиды;
- в работе;
- встречи;
- документы;
- сделки;
- отказы;
- нагрузку сотрудников;
- переход в конкретные лиды.

## Этап 6. Чат

Чат должен быть привычным и красивым, как современный мессенджер, но без копирования чужого бренда.

Требования:

- список диалогов;
- общий чат;
- личные чаты;
- thread;
- bubbles;
- timestamps;
- read/delivered;
- composer;
- attachments;
- voice waveform;
- video circles;
- reply/reactions, если логика есть;
- smooth new message animation.

На wide-screen чат может быть dock справа рядом с лидами/статистикой.

На узких экранах чат — отдельный раздел.

Если в CRM появилось новое обращение от клиента/компании — оно должно выглядеть как новый диалог/собеседник в списке.

## Этап 7. Голосовые и видеокружки

Текущая проблема: в кружочке не видно запись, нет красивой анимации.

Сделать:

- до доступа к камере показывать красивый pending circle;
- круг вылетает из composer снизу вверх;
- пока камера грузится, виден shimmer/ring loader;
- когда stream готов — видео плавно проявляется внутри круга;
- при просмотре кружок увеличивается;
- закрытие увеличенного круга — плавное scale/opacity;
- прогресс кольцом вокруг видео;
- voice waveform выглядит красиво;
- не блокировать интерфейс.

## Этап 8. Компания, профиль, логи

Компания:

- чистые cards;
- code/env блоки только там, где нужны;
- не использовать случайные тёмные вставки;
- подключения сайта сделать понятно.

Профиль:

- уведомления как switch/status;
- тема как switch;
- passkey/безопасность аккуратно;
- не кнопка «Открыть» там, где нужен статус.

Логи:

- фильтры;
- список событий;
- понятные badges;
- empty states.

## Этап 9. Platform Admin / Mail / Support

Если в проекте есть Platform Admin:

Сделать control center, а не огромные пустые карточки.

Почта:

- привычный mail-client layout;
- папки слева;
- список писем;
- чтение письма;
- composer;
- настройки SMTP отдельно;
- не ставить SMTP поля в одну бесконечную строку.

Support:

- support inbox;
- слева обращения как диалоги;
- центр чат;
- справа карточка компании/пользователя;
- новое обращение появляется как новый собеседник.

## Этап 10. Motion

Обязательно:

- page transition: opacity + translateY(6px), 120–180ms;
- drawer: transform + opacity;
- bottom sheet: translateY + opacity;
- dropdown: scale/opacity/translateY;
- modal: opacity + scale/translateY;
- chat message: opacity + translateY(8px);
- recording circle: launch from composer;
- video viewer: scale from bubble to enlarged view.

Запрещено:

- `transition: all`;
- анимация width/height/top/left/margin/padding для больших блоков;
- серый грязный backdrop;
- backdrop появляется раньше panel;
- backdrop исчезает раньше panel.

## Проверка перед сдачей

Сделать screenshots:

- 360x800;
- 390x844;
- 768x1024;
- 1280x800;
- 1440x900;
- 1920x1080;
- 2560x1440.

Сделать отдельно:

- light theme;
- dark theme;
- leads;
- stats drill-down;
- chat;
- video recording;
- mobile more sheet;
- company;
- profile;
- platform admin;
- mail;
- support.

Сдать отчёт:

- что изменено;
- какие компоненты созданы;
- что не менялось;
- build/lint status;
- screenshots;
- видео/trace по drawer, chat, video circle.

Работа не принимается без скриншотов.