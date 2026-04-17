@AGENTS.md

# Dream Art CRM — Agent Guide

CRM-система для аренды фото/видео оборудования компании **Dream Art** (Ташкент).
Next.js 16 · Supabase · Tailwind CSS · shadcn/ui · Telegraf · pdf-lib

---

## Быстрый старт

```bash
npm run dev          # dev-сервер на :3000
npm run build        # production build (должен проходить без ошибок)
```

**Логин:** `admin@dreamart.uz` / `DreamArt2024!`
**Supabase project:** `ztxkxduqkqrmjfzqstjj`

---

## Структура проекта

```
dream-art-crm/
├── app/                          # Next.js App Router (НЕ src/app)
│   ├── (dashboard)/              # Авторизованная зона (layout с Sidebar + MobileNav)
│   │   ├── layout.tsx            # Загружает роль юзера, рендерит Sidebar + MobileNav
│   │   ├── dashboard/page.tsx    # KPI-дашборд (роль-зависимый)
│   │   ├── equipment/page.tsx    # Каталог карточками → drill-down по категории
│   │   ├── clients/              # Список, новый, [id] редактировать
│   │   ├── orders/               # Список, new (4-шаговый wizard), [id], [id]/return
│   │   ├── calendar/page.tsx     # Timeline 30 дней, показывает имя клиента + автора
│   │   ├── finance/page.tsx      # Финансы (super_admin видит всё, admin — только сегодня)
│   │   └── admin/users/          # Управление пользователями (только super_admin)
│   ├── api/
│   │   ├── equipment/            # CRUD + /availability (проверка двойного бронирования)
│   │   ├── clients/              # CRUD
│   │   ├── orders/               # POST создаёт через RPC; [id]/return, [id]/contract
│   │   ├── payments/             # POST добавить платёж
│   │   ├── analytics/            # GET агрегированная аналитика
│   │   ├── calendar/             # GET события для Timeline
│   │   ├── admin/users/          # POST создать, PATCH роль, DELETE (только super_admin)
│   │   ├── bot/webhook/          # POST Telegram webhook
│   │   └── cron/                 # GET ежедневный cron (Cloudflare Worker)
│   ├── login/page.tsx
│   └── globals.css
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx       # Desktop sidebar, получает role + userName как props
│   │   │   ├── MobileNav.tsx     # Нижний таббар для мобайла/планшета
│   │   │   └── PageHeader.tsx
│   │   ├── equipment/            # EquipmentForm, StatusBadge
│   │   ├── clients/              # ClientForm (с document_type), ReliabilityRating
│   │   ├── orders/OrderForm/     # StepClient, StepEquipment, StepDates, StepSummary
│   │   ├── finance/              # PaymentForm
│   │   └── ui/                   # shadcn/ui примитивы
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Браузерный клиент (с fallback URL)
│   │   │   ├── server.ts         # Серверный клиент (для API routes и Server Components)
│   │   │   └── getRole.ts        # getMyProfile(), getMyRole(), isSuperAdmin()
│   │   ├── pdf/generateContract.ts   # pdf-lib шаблон договора A4
│   │   ├── bot/
│   │   │   ├── index.ts          # Telegraf bot instance
│   │   │   └── notifications.ts  # sendOrderConfirmation, sendReturnReminder, sendOverdueAlert
│   │   ├── validations/          # Zod: client.ts, equipment.ts, order.ts
│   │   └── utils.ts              # formatCurrency (UZS), formatDate, calcDays, LABEL maps
│   ├── middleware.ts              # Supabase session refresh + guard (пропускает /api/bot, /api/cron)
│   └── types/
│       └── database.ts           # Ручные TypeScript типы для всех таблиц Supabase
├── supabase/migrations/          # SQL миграции (применять через Supabase MCP)
├── worker/cron.ts                # Cloudflare Worker — вызывает /api/cron в 08:00 Ташкент
└── wrangler.toml                 # Cloudflare Worker config
```

---

## База данных (PostgreSQL / Supabase)

### Таблицы

| Таблица | Назначение |
|---|---|
| `equipment_categories` | Категории техники (Камеры, Объективы…) |
| `equipment` | Единицы техники; `status`: `free/rented/maintenance/lost` |
| `equipment_maintenance` | Записи о ТО |
| `clients` | Клиенты; поля `document_type`, `reliability_rating` (1–5), `segment` |
| `orders` | Заказы; `status`: `draft/active/returned/overdue/cancelled`; `actual_return_date` для досрочного возврата |
| `order_items` | Позиции заказа (оборудование + daily_rate + days) |
| `payments` | Платежи; `payment_type`: `rental/deposit/deposit_return/extra/fine` |
| `blocked_dates` | Ручная блокировка дат техники (ТО, резерв) |
| `notification_log` | Лог Telegram-уведомлений |
| `user_profiles` | Роли: `super_admin` / `admin`; связан с `auth.users` |

### Ключевые RPC-функции

```sql
-- Атомарное создание заказа (проверка + insert + статус техники)
create_order_atomic(p_client_id, p_start_date, p_end_date, p_deposit_amount,
                    p_notes, p_created_by, p_items jsonb) → order_id

-- Атомарный возврат (обновляет позиции + статус техники → free)
-- p_actual_return_date опционален — пересчитывает сумму если досрочный возврат
return_order_atomic(p_order_id, p_items jsonb, p_actual_return_date date) → void

-- Проверка доступности (overlap-алгоритм)
check_equipment_availability(p_equipment_id, p_start_date, p_end_date,
                              p_exclude_order_id) → boolean
```

### Views

| View | Содержит |
|---|---|
| `v_dashboard_stats` | active_rentals, overdue_count, revenue_today/week/month, equipment_free/rented/maintenance, total_clients |
| `v_overdue_orders` | Просроченные заказы с days_overdue |
| `v_equipment_utilization` | total_rentals, total_revenue, roi_percent по каждой единице |

### Новые колонки (добавлены миграциями)

- `clients.document_type` — `passport_id | passport_green | zagranpassport | drivers_license`
- `orders.actual_return_date` — фактическая дата возврата (для досрочных)

---

## Роли и доступы

| Роль | Финансы | Пользователи | Прочее |
|---|---|---|---|
| `super_admin` | Все периоды (день/месяц/всё время) | ✅ CRUD | Полный доступ |
| `admin` | Только сегодня | ❌ | Работа с клиентами/заказами |

**Проверка роли:**
```typescript
import { isSuperAdmin, getMyRole, getMyProfile } from '@/lib/supabase/getRole'
// Используй только в Server Components и API Routes
```

---

## Конфигурация TypeScript

```json
// tsconfig.json
"paths": { "@/*": ["./src/*", "./*"] }
"strict": false
```

```typescript
// next.config.ts
typescript: { ignoreBuildErrors: true }  // До supabase gen types
```

> **Важно:** Алиас `@/` резолвится в `./src/` И `./` (корень), поэтому:
> - `@/components/…` → `src/components/…`
> - `@/lib/supabase/client` → `src/lib/supabase/client`
> - `@/app/…` → `app/…` (App Router находится в корне, не в src/)

---

## Паттерны кода

### Server Component с Supabase
```typescript
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'  // Обязательно для dashboard-страниц

export default async function Page() {
  const supabase = await createClient()
  const { data } = await supabase.from('orders').select('*')
  // ...
}
```

### API Route
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // ...
}
```

### Проверка роли в API Route
```typescript
import { isSuperAdmin } from '@/lib/supabase/getRole'
if (!(await isSuperAdmin())) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

### Форматирование
```typescript
import { formatCurrency, formatDate, calcDays } from '@/lib/utils'
formatCurrency(150000)  // → "150 000 UZS"
formatDate('2026-04-18')  // → "18.04.2026"
calcDays('2026-04-18', '2026-04-20')  // → 3
```

---

## UI/UX правила

- **Минимальные размеры tap-target:** `min-h-[44px]` на всех кнопках и интерактивных элементах
- **Строки списков:** `min-h-[64px]` для удобства нажатия на планшете
- **Скруглени:** используй `rounded-2xl` (не `rounded-xl`) для карточек и панелей
- **Нижний navbar** (`MobileNav`) — только на `lg:hidden`; desktop — `Sidebar` (`hidden lg:flex`)
- **Активное состояние nav:** `bg-blue-50 text-blue-700`

---

## Переменные окружения (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://ztxkxduqkqrmjfzqstjj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…
SUPABASE_SERVICE_ROLE_KEY=REDACTED_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN=<токен бота>
TELEGRAM_WEBHOOK_SECRET=<случайная строка>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Частые ошибки и решения

| Проблема | Решение |
|---|---|
| Build crash «invalid Supabase URL» | В `client.ts` есть fallback `?? 'http://localhost:54321'` |
| Страница падает при prerender | Добавь `export const dynamic = 'force-dynamic'` |
| Тип relational query возвращает `never` | `strict: false` + `ignoreBuildErrors: true` — норма до `supabase gen types` |
| Двойное бронирование | Используй только `create_order_atomic` RPC, не делай insert напрямую |
| Port 3000 занят | `lsof -ti :3000 | xargs kill -9` |

---

## Применение миграций

Используй Supabase MCP:
```
mcp__supabase__apply_migration(name: "snake_case_name", query: "SQL...")
```
Для DDL всегда `apply_migration`, для SELECT/INSERT — `execute_sql`.
