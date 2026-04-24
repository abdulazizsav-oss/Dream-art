-- ============================================================
-- Payment groups: объединяем сплит-платежи общим UUID
-- Позволяет в UI/отчётах показывать один платёж из N способов
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_payments_group_id
  ON payments(payment_group_id)
  WHERE payment_group_id IS NOT NULL;

COMMENT ON COLUMN payments.payment_group_id IS
  'UUID группы для сплит-платежей (одна транзакция из нескольких способов). NULL = единичный платёж.';

-- ============================================================
-- Подчистка: больше не используем рассчёт по «количеству аренд»
-- Оставляем колонку в view для backward-compat, но она не
-- показывается нигде в UI.
-- ============================================================

-- Нет изменений схемы — просто коммент для истории
DO $$ BEGIN
  RAISE NOTICE 'Migration 016 applied: payment_group_id + indexes';
END $$;
