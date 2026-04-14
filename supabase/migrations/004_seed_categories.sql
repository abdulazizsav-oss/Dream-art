-- ============================================================
-- Dream Art CRM — Seed: Equipment Categories
-- ============================================================

INSERT INTO equipment_categories (name, slug) VALUES
  ('Камеры', 'cameras'),
  ('Объективы', 'lenses'),
  ('Освещение', 'lighting'),
  ('Аудио', 'audio'),
  ('Стабилизаторы', 'stabilizers'),
  ('Аксессуары', 'accessories')
ON CONFLICT (slug) DO NOTHING;
