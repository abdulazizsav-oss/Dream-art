# 🖥️ Dream Art CRM — Инструкция по серверу (VPS)

## 📌 Быстрая справка

| Параметр | Значение |
|----------|----------|
| **IP-адрес** | `138.249.7.36` |
| **Хостинг** | Eskiz VPS (`vps.eskiz.uz`) |
| **ОС** | Ubuntu 24.04 LTS |
| **RAM** | 2 ГБ + 4 ГБ Swap |
| **Диск** | 40 ГБ |
| **CRM сайт** | `http://138.249.7.36` |
| **Supabase API** | `http://138.249.7.36:8000` |

---

## 🔐 Подключение к серверу (SSH)

```bash
ssh root@138.249.7.36
# Пароль: GprgLmNWO26qJ8T0
```

> SSH-ключ с MacBook уже добавлен — пароль не потребуется если подключаетесь с основного компьютера.

---

## 📁 Структура файлов на сервере

```
/var/www/dream-art-crm/          # ← CRM-приложение (Next.js)
├── .env.local                   # Переменные окружения
├── ecosystem.config.js          # Конфигурация PM2
├── .github/workflows/deploy.yml # CI/CD workflow
└── ...                          # Исходный код

/opt/supabase/docker/            # ← Self-hosted Supabase
├── .env                         # Ключи и пароли Supabase
├── docker-compose.yml           # Docker конфигурация
└── volumes/                     # Данные PostgreSQL

/root/remote_db_dump.sql         # Дамп облачной БД (бэкап)
```

---

## 🔑 Ключи и пароли

### Supabase (локальный)
```
ANON_KEY=<supabase_anon_key>

SERVICE_ROLE_KEY=<supabase_service_role_key>

POSTGRES_PASSWORD=<postgres_password>
```

### CRM App (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=http://138.249.7.36:8000
NEXT_PUBLIC_APP_URL=http://138.249.7.36
```

---

## ⚙️ Управление сервисами

### CRM-приложение (PM2)

```bash
# Статус
pm2 list

# Перезапуск
pm2 restart dream-art

# Логи (в реальном времени)
pm2 logs dream-art

# Полная пересборка
cd /var/www/dream-art-crm
npm run build
pm2 restart dream-art
```

### Supabase (Docker)

```bash
# Статус всех контейнеров
docker ps --format "table {{.Names}}\t{{.Status}}"

# Перезапуск всего Supabase
cd /opt/supabase/docker
docker compose restart

# Перезапуск конкретного сервиса
docker compose restart supabase-db        # База данных
docker compose restart supabase-auth      # Авторизация
docker compose restart supabase-rest      # REST API
docker compose restart supabase-kong      # API Gateway
docker compose restart supabase-storage   # Хранилище файлов

# Остановить всё
docker compose down

# Запустить всё
docker compose up -d

# Логи базы данных
docker logs supabase-db --tail 50 -f
```

### Nginx

```bash
# Проверить конфигурацию
nginx -t

# Перезапуск
systemctl restart nginx

# Конфигурация сайта
cat /etc/nginx/sites-available/dream-art
```

---

## 🗄️ Работа с базой данных

### Подключение к PostgreSQL

```bash
# Через Docker
docker exec -it supabase-db psql -U postgres -d postgres

# Примеры SQL-запросов
docker exec supabase-db psql -U postgres -d postgres -c "SELECT * FROM orders;"
docker exec supabase-db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM clients;"
```

### Создать бэкап базы

```bash
docker exec supabase-db pg_dump -U postgres -d postgres --clean --if-exists > /root/backup_$(date +%Y%m%d).sql
```

### Восстановить бэкап

```bash
cat /root/backup_YYYYMMDD.sql | docker exec -i supabase-db psql -U postgres -d postgres
```

### Применить SQL-миграцию

```bash
cat /var/www/dream-art-crm/supabase/migrations/NNN_migration.sql | docker exec -i supabase-db psql -U postgres -d postgres
```

---

## 🚀 CI/CD — Автоматическое обновление

При `git push origin main` GitHub Actions автоматически:
1. Подключается к серверу по SSH
2. Делает `git pull origin main`
3. Устанавливает зависимости (`npm install`)
4. Собирает проект (`npm run build`)
5. Перезапускает PM2 (`pm2 restart dream-art`)

### Ручное обновление (если CI/CD не работает)

```bash
ssh root@138.249.7.36
cd /var/www/dream-art-crm
git pull origin main
npm install
npm run build
pm2 restart dream-art
```

### GitHub Secrets (для CI/CD)

| Secret | Значение |
|--------|----------|
| `SERVER_IP` | `138.249.7.36` |
| `SERVER_USER` | `root` |
| `SERVER_SSH_KEY` | ED25519 deploy key (уже настроен) |

---

## 🔌 Порты

| Порт | Сервис | Доступ |
|------|--------|--------|
| `22` | SSH | Открыт |
| `80` | Nginx → CRM (Next.js :3000) | Открыт |
| `3000` | Next.js (CRM) | Только localhost |
| `8000` | Supabase Kong (API Gateway) | Открыт |
| `8443` | Supabase Kong (HTTPS) | Открыт |
| `5432` | Supabase Pooler | Открыт |
| `6543` | Supabase Pooler (Transaction) | Открыт |

---

## 🔍 Диагностика проблем

### Сайт не открывается
```bash
# 1. Проверить PM2
pm2 list
# Если status = errored → pm2 logs dream-art

# 2. Проверить Nginx
nginx -t && systemctl status nginx

# 3. Проверить порт
curl -I http://localhost:3000
```

### API возвращает ошибки
```bash
# 1. Проверить контейнеры Supabase
docker ps | grep supabase

# 2. Если контейнер упал — перезапустить
cd /opt/supabase/docker
docker compose up -d

# 3. Проверить API
curl http://localhost:8000/rest/v1/ \
  -H "apikey: <ANON_KEY>"
```

### Сервер тормозит
```bash
# Проверить память
free -h

# Проверить что ест ресурсы
docker stats --no-stream
pm2 monit
```

---

## 📋 Контейнеры Supabase (13 штук)

| Контейнер | Назначение |
|-----------|------------|
| `supabase-db` | PostgreSQL 15 — основная БД |
| `supabase-auth` | GoTrue — авторизация и JWT |
| `supabase-rest` | PostgREST — REST API из SQL |
| `supabase-kong` | Kong — API Gateway (порт 8000) |
| `supabase-studio` | Supabase Studio — веб-интерфейс БД |
| `supabase-storage` | Хранилище файлов |
| `supabase-meta` | Метаданные PostgreSQL |
| `supabase-pooler` | PgBouncer — пулер соединений |
| `supabase-analytics` | Logflare — аналитика |
| `supabase-vector` | Векторный поиск |
| `supabase-imgproxy` | Обработка изображений |
| `supabase-edge-functions` | Deno Edge Functions |
| `supabase-realtime` | WebSocket realtime |

---

## 📝 Примечания

- **Swap**: На сервере 2 ГБ RAM + 4 ГБ Swap. При высокой нагрузке может тормозить. Рекомендуется повысить тариф до 4+ ГБ RAM.
- **SSL**: Сертификат ещё не настроен. Для настройки нужен домен с A-записью на `138.249.7.36`, после чего: `certbot --nginx -d your-domain.com`
- **Бэкапы**: Автоматические бэкапы НЕ настроены. Рекомендуется добавить cron-задачу для ежедневного бэкапа БД.
- **Git-репозиторий**: `https://github.com/abdulazizsav-oss/Dream-art.git` (ветка `main`)
