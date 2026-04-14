# Dream Art CRM — Инструкция по запуску

## 1. Создать Supabase проект

1. Зайти на [supabase.com](https://supabase.com) → создать новый проект
2. Скопировать `Project URL` и `anon key` из Settings → API
3. Обновить `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

## 2. Применить миграции

В Supabase Dashboard → SQL Editor — выполнить по порядку:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_functions_views.sql`
4. `supabase/migrations/004_seed_categories.sql`

Или через Supabase CLI:
```bash
npx supabase db push
```

## 3. Создать первого пользователя

В Supabase Dashboard → Authentication → Users → Add user (email + password).

## 4. Создать Telegram бота

1. Написать @BotFather в Telegram → `/newbot`
2. Скопировать токен в `.env.local`:
   ```env
   TELEGRAM_BOT_TOKEN=1234567890:ABC...
   TELEGRAM_WEBHOOK_SECRET=any_random_string_32chars
   ```
3. После деплоя установить webhook:
   ```
   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://your-domain.pages.dev/api/bot/webhook&secret_token={WEBHOOK_SECRET}
   ```

## 5. Запустить локально

```bash
npm run dev
```

Открыть: http://localhost:3000

## 6. Деплой на Cloudflare Pages

```bash
# Установить Wrangler
npm install -g wrangler
wrangler login

# Создать Pages проект
wrangler pages project create dream-art-crm

# Деплой
npm run build
wrangler pages deploy .next --project-name=dream-art-crm
```

В Cloudflare Dashboard → Pages → dream-art-crm → Settings → Environment variables:
Добавить все переменные из `.env.local`

## 7. Настроить Cron Worker (напоминания)

```bash
# Добавить переменные в Worker
wrangler secret put APP_URL          # https://your-domain.pages.dev
wrangler secret put CRON_SECRET      # любая случайная строка

# Деплой Worker
wrangler deploy worker/cron.ts
```

Также добавить `CRON_SECRET` в `.env.local` и в Cloudflare Pages.

## 8. Генерация типов Supabase (опционально)

После подключения к Supabase:
```bash
npx supabase gen types typescript --project-id your-project-id > src/types/database.ts
```

Это заменит ручной файл типов на автогенерированный.

---

## Структура проекта

```
app/                    # Next.js App Router страницы
  (dashboard)/         # Защищённые страницы CRM
    dashboard/         # Дашборд с KPI
    equipment/         # Управление техникой  
    clients/           # База клиентов
    orders/            # Заказы (аренда)
    calendar/          # Календарь бронирований
    finance/           # Финансы и платежи
  login/               # Страница входа
  api/                 # API маршруты
    equipment/         # CRUD техники + проверка доступности
    clients/           # CRUD клиентов
    orders/            # Создание/возврат заказов + PDF договор
    payments/          # Платежи
    analytics/         # Данные для дашборда
    calendar/          # Данные для календаря
    bot/webhook/       # Telegram bot webhook
    cron/              # Ежедневные задачи (напоминания)

src/
  components/          # React компоненты
  lib/                 # Утилиты, Supabase клиент, PDF, Telegram бот
  types/               # TypeScript типы (заменить через supabase gen types)

supabase/migrations/   # SQL миграции для базы данных
worker/                # Cloudflare Worker для cron-задач
```
