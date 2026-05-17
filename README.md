# SvoyDom CRM

Отдельный Next.js сайт для CRM. Лендинг отправляет заявки на этот проект через `POST /api/lead`, а CRM пишет и читает данные из той же PostgreSQL базы через `DATABASE_URL`.

## Быстрый старт

```bash
npm install
cp .env.example .env.local
npm run dev
```

Откройте [http://localhost:3000/admin](http://localhost:3000/admin).

## Переменные окружения

- `DATABASE_URL` — текущая PostgreSQL база CRM.
- `JWT_SECRET` — длинный постоянный секрет для cookies авторизации.
- `ALLOWED_LEAD_ORIGIN` — домен лендинга, которому разрешено отправлять заявки, например `https://svoydom-lugansk.ru`.
- `BITRIX24_WEBHOOK_URL` — опционально, webhook Bitrix24 без `/crm.lead.add.json` на конце.
- `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY` — опционально, для push-уведомлений.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — S3-совместимое хранилище для фото и видео общего чата.
- `S3_PUBLIC_BASE_URL` — публичный базовый URL бакета или CDN для файлов чата, например `https://cdn.example.com/svoydom-crm`. Если не задан, CRM попробует собрать URL как `S3_ENDPOINT/S3_BUCKET/key`.

## Общий чат CRM

В админ-панели есть вкладка `Общий чат`, доступная администраторам и сотрудникам. Текстовые сообщения хранятся в PostgreSQL, а фото и видео-круги загружаются в S3-совместимый публичный бакет.

Для Timeweb S3 создайте бакет с публичным чтением файлов и добавьте в окружение переменные `S3_*`. Если S3-переменные не заданы, сборка приложения проходит, но загрузка медиа в чате вернёт понятную ошибку при отправке файла.

## Timeweb Node.js/VPS

```bash
npm install
npm run build
npm run start
```

В панели Timeweb укажите команду сборки `npm run build`, команду запуска `npm run start` и порт из переменной `PORT`, если платформа его задаёт.

## Проверка API лидов

```bash
curl -X POST https://crm.example.ru/api/lead \
  -H "Content-Type: application/json" \
  -H "Origin: https://svoydom-lugansk.ru" \
  -d "{\"name\":\"Тест\",\"phone\":\"+79990001122\",\"privacyConsent\":true,\"pageUrl\":\"https://svoydom-lugansk.ru\",\"answers\":{}}"
```

