-- ============================================================
-- Dream Art CRM — Initial Schema
-- ============================================================

-- Equipment Categories
CREATE TABLE equipment_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Equipment
CREATE TABLE equipment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid REFERENCES equipment_categories(id) ON DELETE SET NULL,
  name          text NOT NULL,
  serial_number text UNIQUE,
  photo_url     text,
  purchase_cost numeric(10,2),
  daily_rate    numeric(10,2) NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'free'
                  CHECK (status IN ('free','rented','maintenance','lost')),
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Equipment Maintenance Log
CREATE TABLE equipment_maintenance (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id   uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  scheduled_date date,
  completed_date date,
  description    text,
  cost           numeric(10,2),
  created_at     timestamptz DEFAULT now()
);

-- Clients
CREATE TABLE clients (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            text NOT NULL,
  phone                text,
  telegram_username    text,
  telegram_chat_id     bigint,
  passport_series      text,
  passport_number      text,
  passport_issued_by   text,
  passport_issued_date date,
  deposit_held         numeric(10,2) DEFAULT 0,
  reliability_rating   int DEFAULT 3 CHECK (reliability_rating BETWEEN 1 AND 5),
  segment              text DEFAULT 'other'
                         CHECK (segment IN ('photographer','videographer','studio','agency','one_time','other')),
  notes                text,
  birth_date           date,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- Orders
CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     text UNIQUE NOT NULL,
  client_id        uuid NOT NULL REFERENCES clients(id),
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('draft','active','returned','overdue','cancelled')),
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  total_amount     numeric(10,2) DEFAULT 0,
  deposit_amount   numeric(10,2) DEFAULT 0,
  deposit_returned boolean DEFAULT false,
  contract_pdf_url text,
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Order Items
CREATE TABLE order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id        uuid NOT NULL REFERENCES equipment(id),
  daily_rate          numeric(10,2) NOT NULL,
  days                int NOT NULL,
  subtotal            numeric(10,2) NOT NULL,
  condition_on_issue  text DEFAULT 'Хорошее',
  condition_on_return text,
  issue_photo_urls    text[] DEFAULT '{}',
  return_photo_urls   text[] DEFAULT '{}'
);

-- Payments
CREATE TABLE payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount         numeric(10,2) NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash','transfer','card')),
  payment_type   text NOT NULL DEFAULT 'rental'
                   CHECK (payment_type IN ('rental','deposit','deposit_return','extra','fine')),
  paid_at        timestamptz DEFAULT now(),
  notes          text,
  created_by     uuid REFERENCES auth.users(id)
);

-- Blocked Dates (for maintenance reservations)
CREATE TABLE blocked_dates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  reason       text,
  created_at   timestamptz DEFAULT now()
);

-- Notification Log
CREATE TABLE notification_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid REFERENCES orders(id) ON DELETE SET NULL,
  client_id           uuid REFERENCES clients(id) ON DELETE SET NULL,
  type                text NOT NULL
                        CHECK (type IN ('confirmation','reminder_24h','return_day','overdue','payment_receipt','birthday')),
  sent_at             timestamptz DEFAULT now(),
  telegram_message_id bigint,
  success             boolean DEFAULT true
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER equipment_updated_at BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Order number sequence helper
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'DA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');
END;
$$;
