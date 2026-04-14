-- ============================================================
-- Dream Art CRM — Row Level Security Policies
-- All tables: authenticated users (business owner/staff) have full access
-- ============================================================

ALTER TABLE equipment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment            ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log     ENABLE ROW LEVEL SECURITY;

-- Equipment Categories
CREATE POLICY "auth_all_equipment_categories" ON equipment_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Equipment
CREATE POLICY "auth_all_equipment" ON equipment
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Equipment Maintenance
CREATE POLICY "auth_all_maintenance" ON equipment_maintenance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Clients
CREATE POLICY "auth_all_clients" ON clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Orders
CREATE POLICY "auth_all_orders" ON orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Order Items
CREATE POLICY "auth_all_order_items" ON order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Payments
CREATE POLICY "auth_all_payments" ON payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Blocked Dates
CREATE POLICY "auth_all_blocked_dates" ON blocked_dates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Notification Log
CREATE POLICY "auth_all_notification_log" ON notification_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
