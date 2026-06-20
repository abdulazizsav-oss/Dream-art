-- Make night-shift pricing a per-equipment capability instead of a category rule.
-- `day`  = no separate night shift; any night units are billed as day units.
-- `both` = day + night rates are available for this exact equipment item.
-- `night` remains supported for existing enum compatibility, though the UI exposes
-- day/both because Dream Art normally rents items by day with optional night pricing.

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS day_night text NOT NULL DEFAULT 'day'
    CHECK (day_night IN ('day', 'night', 'both'));

ALTER TABLE equipment
  ALTER COLUMN day_night SET DEFAULT 'day';

UPDATE equipment
SET
  day_night = CASE
    WHEN COALESCE(night_rate, day_rate, daily_rate, 0)
      IS DISTINCT FROM COALESCE(day_rate, daily_rate, 0)
      THEN 'both'
    ELSE 'day'
  END,
  night_rate = CASE
    WHEN COALESCE(night_rate, 0) = 0
      THEN COALESCE(day_rate, daily_rate, 0)
    ELSE night_rate
  END
WHERE day_night IS NULL
   OR day_night = 'both';
