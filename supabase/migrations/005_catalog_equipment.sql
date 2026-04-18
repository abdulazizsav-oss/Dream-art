-- ============================================================
-- Dream Art CRM — Catalog-first equipment hierarchy
-- Top-level categories -> brand/type groups -> equipment cards
-- ============================================================

ALTER TABLE equipment_categories
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UZS'
    CHECK (currency IN ('UZS', 'USD')),
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS specs text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'passport_id'
    CHECK (document_type IN ('passport_id','passport_green','zagranpassport','drivers_license'));

CREATE TABLE IF NOT EXISTS user_profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  role       text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','super_admin')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_user_profiles" ON user_profiles;
CREATE POLICY "auth_all_user_profiles" ON user_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Hide previously over-specific catalog groups if they exist from older drafts.
UPDATE equipment_categories
SET is_active = false
WHERE slug IN (
  'sony-cameras',
  'canon-cameras',
  'cinema-cameras',
  'action-cameras',
  'smartphone',
  'monitors',
  'filters',
  'vertical-shooting',
  'wireless-tech',
  'tripods',
  'sliders',
  'studio-backgrounds',
  'special-effects',
  'power',
  'storage'
);

INSERT INTO equipment_categories (name, slug, sort_order, is_active) VALUES
  ('Камеры', 'cameras', 10, true),
  ('Объективы', 'lenses', 20, true),
  ('Свет', 'lighting', 30, true),
  ('Аудио', 'audio', 40, true),
  ('Стабилизаторы', 'stabilizers', 50, true),
  ('Стойки', 'stands', 60, true),
  ('Аксессуары', 'accessories', 70, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

WITH source_items(slug, brand, name, specs, daily_rate, currency, notes, source, sort_order) AS (
  VALUES
    ('cameras','Sony','Sony A7 III KIT','Full-frame, беззеркальная, комплект с объективом',80000,'UZS','Универсальная камера','Каталог техники',10),
    ('cameras','Sony','Sony A7 IV KIT','Full-frame, 4K видео, автофокус нового поколения',100000,'UZS','Актуальная модель','Каталог техники',20),
    ('cameras','Sony','Sony FX3 KIT','Cinema Line, full-frame, 4K, проф видео',150000,'UZS','Видео продакшн','Каталог техники',30),
    ('cameras','Sony','Sony FX30 KIT','Super35, Cinema Line, 4K',150000,'UZS','Более доступный cinema вариант','Каталог техники',40),
    ('cameras','Sony','Sony A1 BODY 8K','8K видео, флагман Sony',300000,'UZS','Только body','Каталог техники',50),
    ('cameras','Canon','Canon R5 C KIT','8K видео, гибрид фото/видео',200000,'UZS','Cinema + фото','Каталог техники',60),
    ('cameras','Canon','Canon R6 Mark II KIT','Full-frame, быстрый автофокус',80000,'UZS','Универсальный вариант','Каталог техники',70),
    ('cameras','Canon','Canon 5D Mark IV KIT','DSLR, full-frame',50000,'UZS','Надежная классика','Каталог техники',80),
    ('cameras','Canon','Canon G7X Mark III','Компакт, блогинг камера',300000,'UZS','Популярна у блогеров','Каталог техники',90),
    ('cameras','RED','RED Komodo 6K','6K RAW, cinema камера',50,'USD','Кино комплект','Каталог техники',100),
    ('cameras','Blackmagic','Blackmagic 6K PRO','Super35, RAW',60,'USD','Продакшн камера','Каталог техники',110),
    ('cameras','GoPro','GoPro 11','Экшн камера, стабилизация',150000,'UZS','Для активной съемки','Каталог техники',120),
    ('cameras','Insta360','Insta360 One X2','360° съемка',150000,'UZS','VR формат','Каталог техники',130),

    ('lenses','Sony','Sony 24mm f/1.4 GM','Широкоугольный, светосильный, GM серия',100000,'UZS','Премиум оптика','Каталог техники',140),
    ('lenses','Sony','Sony 50mm f/1.2 GM','Портретный, высокая светосила',200000,'UZS','Топ сегмент','Каталог техники',150),
    ('lenses','Sony','Sony 70-200mm f/2.8 GM OSS','Телезум, стабилизация OSS',100000,'UZS','Универсальный зум','Каталог техники',160),

    ('lighting','Godox','Godox SL30','Постоянный свет',100000,'UZS','Базовый вариант','Каталог техники',170),
    ('lighting','Amaran','Amaran 300C RGB','RGB свет, регулируемые цвета',100000,'UZS','Креативный свет','Каталог техники',180),
    ('lighting','Godox','Godox AD600 Pro','Импульсный студийный свет',200000,'UZS','Профессиональный','Каталог техники',190),

    ('audio','Sennheiser','Sennheiser G4','Петличный радиомикрофон',80000,'UZS','Надежный звук','Каталог техники',200),
    ('audio','DJI','DJI Mic (2 передатчика)','Беспроводной микрофон',100000,'UZS','Удобен для интервью','Каталог техники',210),
    ('audio','Zoom','Zoom H6','Портативный рекордер',50000,'UZS','Для записи звука','Каталог техники',220),

    ('stabilizers','DJI','DJI RS4 Pro','До 4.5 кг нагрузка',200000,'UZS','Профессиональный стабилизатор','Каталог техники',230),
    ('stabilizers','DJI','DJI RS3 Pro','До 4.5 кг нагрузка',150000,'UZS','Популярный вариант','Каталог техники',240),

    ('accessories','Фильтры','ND Filter (82mm)','ND фильтр',50000,'UZS','Контроль света','Каталог техники',250),
    ('accessories','Накопители','SSD 1TB (T7 / AtomX)','Внешний накопитель',100000,'UZS','Для видео. Цена зависит от модели: 100.000–150.000','Каталог техники',260)
)
INSERT INTO equipment (
  category_id,
  name,
  daily_rate,
  currency,
  brand,
  specs,
  notes,
  source,
  sort_order,
  status,
  serial_number
)
SELECT
  c.id,
  s.name,
  s.daily_rate,
  s.currency,
  s.brand,
  s.specs,
  s.notes,
  s.source,
  s.sort_order,
  'free',
  NULL
FROM source_items s
JOIN equipment_categories c ON c.slug = s.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM equipment e
  WHERE lower(e.name) = lower(s.name)
);

UPDATE equipment e
SET
  category_id = c.id,
  brand = s.brand,
  specs = s.specs,
  daily_rate = s.daily_rate,
  currency = s.currency,
  notes = s.notes,
  source = s.source,
  sort_order = s.sort_order
FROM (
  VALUES
    ('cameras','Sony','Sony A7 III KIT','Full-frame, беззеркальная, комплект с объективом',80000,'UZS','Универсальная камера','Каталог техники',10),
    ('cameras','Sony','Sony A7 IV KIT','Full-frame, 4K видео, автофокус нового поколения',100000,'UZS','Актуальная модель','Каталог техники',20),
    ('cameras','Sony','Sony FX3 KIT','Cinema Line, full-frame, 4K, проф видео',150000,'UZS','Видео продакшн','Каталог техники',30),
    ('cameras','Sony','Sony FX30 KIT','Super35, Cinema Line, 4K',150000,'UZS','Более доступный cinema вариант','Каталог техники',40),
    ('cameras','Sony','Sony A1 BODY 8K','8K видео, флагман Sony',300000,'UZS','Только body','Каталог техники',50),
    ('cameras','Canon','Canon R5 C KIT','8K видео, гибрид фото/видео',200000,'UZS','Cinema + фото','Каталог техники',60),
    ('cameras','Canon','Canon R6 Mark II KIT','Full-frame, быстрый автофокус',80000,'UZS','Универсальный вариант','Каталог техники',70),
    ('cameras','Canon','Canon 5D Mark IV KIT','DSLR, full-frame',50000,'UZS','Надежная классика','Каталог техники',80),
    ('cameras','Canon','Canon G7X Mark III','Компакт, блогинг камера',300000,'UZS','Популярна у блогеров','Каталог техники',90),
    ('cameras','RED','RED Komodo 6K','6K RAW, cinema камера',50,'USD','Кино комплект','Каталог техники',100),
    ('cameras','Blackmagic','Blackmagic 6K PRO','Super35, RAW',60,'USD','Продакшн камера','Каталог техники',110),
    ('cameras','GoPro','GoPro 11','Экшн камера, стабилизация',150000,'UZS','Для активной съемки','Каталог техники',120),
    ('cameras','Insta360','Insta360 One X2','360° съемка',150000,'UZS','VR формат','Каталог техники',130),
    ('lenses','Sony','Sony 24mm f/1.4 GM','Широкоугольный, светосильный, GM серия',100000,'UZS','Премиум оптика','Каталог техники',140),
    ('lenses','Sony','Sony 50mm f/1.2 GM','Портретный, высокая светосила',200000,'UZS','Топ сегмент','Каталог техники',150),
    ('lenses','Sony','Sony 70-200mm f/2.8 GM OSS','Телезум, стабилизация OSS',100000,'UZS','Универсальный зум','Каталог техники',160),
    ('lighting','Godox','Godox SL30','Постоянный свет',100000,'UZS','Базовый вариант','Каталог техники',170),
    ('lighting','Amaran','Amaran 300C RGB','RGB свет, регулируемые цвета',100000,'UZS','Креативный свет','Каталог техники',180),
    ('lighting','Godox','Godox AD600 Pro','Импульсный студийный свет',200000,'UZS','Профессиональный','Каталог техники',190),
    ('audio','Sennheiser','Sennheiser G4','Петличный радиомикрофон',80000,'UZS','Надежный звук','Каталог техники',200),
    ('audio','DJI','DJI Mic (2 передатчика)','Беспроводной микрофон',100000,'UZS','Удобен для интервью','Каталог техники',210),
    ('audio','Zoom','Zoom H6','Портативный рекордер',50000,'UZS','Для записи звука','Каталог техники',220),
    ('stabilizers','DJI','DJI RS4 Pro','До 4.5 кг нагрузка',200000,'UZS','Профессиональный стабилизатор','Каталог техники',230),
    ('stabilizers','DJI','DJI RS3 Pro','До 4.5 кг нагрузка',150000,'UZS','Популярный вариант','Каталог техники',240),
    ('accessories','Фильтры','ND Filter (82mm)','ND фильтр',50000,'UZS','Контроль света','Каталог техники',250),
    ('accessories','Накопители','SSD 1TB (T7 / AtomX)','Внешний накопитель',100000,'UZS','Для видео. Цена зависит от модели: 100.000–150.000','Каталог техники',260)
) AS s(slug, brand, name, specs, daily_rate, currency, notes, source, sort_order)
JOIN equipment_categories c ON c.slug = s.slug
WHERE lower(e.name) = lower(s.name);

CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM orders WHERE status = 'active') AS active_rentals,
  (SELECT COUNT(*) FROM v_overdue_orders) AS overdue_count,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE paid_at >= date_trunc('day', now())
     AND payment_type NOT IN ('deposit', 'deposit_return')) AS revenue_today,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE paid_at >= date_trunc('month', now())
     AND payment_type NOT IN ('deposit', 'deposit_return')) AS revenue_this_month,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE paid_at >= date_trunc('week', now())
     AND payment_type NOT IN ('deposit', 'deposit_return')) AS revenue_this_week,
  (SELECT COUNT(*) FROM equipment WHERE status = 'free') AS equipment_free,
  (SELECT COUNT(*) FROM equipment WHERE status = 'rented') AS equipment_rented,
  (SELECT COUNT(*) FROM equipment WHERE status = 'maintenance') AS equipment_maintenance,
  (SELECT COUNT(*) FROM clients) AS total_clients;
