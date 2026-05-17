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

