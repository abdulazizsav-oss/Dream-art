-- Run only against an isolated database. All fixtures are rolled back.
BEGIN;
INSERT INTO auth.users(id) VALUES ('20000000-0000-4000-8000-000000000001');
INSERT INTO public.user_profiles(id, full_name, nickname, role)
VALUES ('20000000-0000-4000-8000-000000000001', 'Cancellation test', 'cancel-test', 'admin');
INSERT INTO public.clients(id, full_name) VALUES ('20000000-0000-4000-8000-000000000002', 'Cancellation fixture');
INSERT INTO public.equipment(id, name, daily_rate, day_rate, status)
VALUES ('20000000-0000-4000-8000-000000000003', 'Shared camera', 100, 100, 'rented'),
       ('20000000-0000-4000-8000-000000000004', 'Returned camera', 100, 100, 'rented'),
       ('20000000-0000-4000-8000-000000000005', 'Maintenance camera', 100, 100, 'maintenance');
INSERT INTO public.orders(id, order_number, client_id, status, start_date, end_date, total_amount, delivery_fee)
SELECT ('20000000-0000-4000-8000-00000000001' || n)::uuid, 'CANCEL-TEST-' || n, '20000000-0000-4000-8000-000000000002',
 CASE WHEN n = 2 THEN 'returned' ELSE 'active' END, current_date, current_date, 350, 50
FROM generate_series(0,3) n;
INSERT INTO public.order_items(id, order_id, equipment_id, daily_rate, days, subtotal, returned, selected_kit_items, missing_kit_items)
VALUES
 ('20000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000003', 100, 1, 100, false, ARRAY['Крышка'], '{}'),
 ('20000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000004', 100, 1, 100, true, ARRAY['Зарядка'], ARRAY['Зарядка']),
 ('20000000-0000-4000-8000-000000000022', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000005', 100, 1, 100, false, '{}', '{}'),
 ('20000000-0000-4000-8000-000000000023', '20000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000003', 100, 1, 100, false, '{}', '{}');
INSERT INTO public.order_item_missing_kit_events(order_id, order_item_id, kit_name)
VALUES ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000021', 'Зарядка');
INSERT INTO public.payments(id, order_id, amount, payment_type)
VALUES ('20000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-000000000010', 100, 'rental'),
       ('20000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000010', 50, 'deposit');
INSERT INTO public.order_item_payment_allocations(payment_id, order_item_id, amount)
VALUES ('20000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-000000000021', 100);
DO $$
DECLARE
  v_id uuid := '20000000-0000-4000-8000-000000000010';
  v_admin uuid := '20000000-0000-4000-8000-000000000001';
  v_items jsonb;
  v_finance jsonb;
BEGIN
  IF has_function_privilege('authenticated', 'public.cancel_order_atomic(uuid,text,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_cancelled_order_refund_atomic(uuid,uuid,numeric,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Cancellation RPC permissions are too broad';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id', id, 'returned', returned, 'selected_kit_items', selected_kit_items, 'missing_kit_items', missing_kit_items))
    INTO v_items FROM public.order_items WHERE order_id = v_id;
  BEGIN
    PERFORM public.cancel_order_atomic(v_id, 'stale', '[]', v_admin);
    RAISE EXCEPTION 'TEST: stale item snapshot accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  IF EXISTS (SELECT 1 FROM public.order_cancellations WHERE order_id = v_id) THEN RAISE EXCEPTION 'Failed cancellation wrote audit'; END IF;
  BEGIN
    PERFORM public.cancel_order_atomic(v_id, 'unauthorized', v_items, NULL);
    RAISE EXCEPTION 'TEST: absent actor accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.cancel_order_atomic('20000000-0000-4000-8000-000000000012', 'closed', '[]', v_admin);
    RAISE EXCEPTION 'TEST: returned order accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  PERFORM public.cancel_order_atomic(v_id, 'Returned for different equipment', v_items, v_admin);
  PERFORM public.cancel_order_atomic(v_id, 'retry', v_items, v_admin);
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id=v_id AND status='cancelled' AND total_amount=0 AND delivery_fee=0) THEN RAISE EXCEPTION 'Cancellation totals incorrect'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id=v_id AND (NOT returned OR subtotal<>0 OR final_subtotal<>0 OR cardinality(missing_kit_items)>0)) THEN RAISE EXCEPTION 'Items not fully returned and waived'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_item_missing_kit_events WHERE order_id=v_id AND returned_at IS NULL) THEN RAISE EXCEPTION 'Missing kit not closed'; END IF;
  IF (SELECT original_total FROM public.order_cancellations WHERE order_id=v_id) <> 350 THEN RAISE EXCEPTION 'Original charges lost'; END IF;
  IF (SELECT count(*) FROM public.payments WHERE order_id=v_id) <> 2 THEN RAISE EXCEPTION 'Cancellation generated/deleted payment'; END IF;
  IF (SELECT count(*) FROM public.order_item_payment_allocations WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id=v_id)) <> 1 THEN RAISE EXCEPTION 'Payment allocation history lost'; END IF;
  IF (SELECT status FROM public.equipment WHERE id='20000000-0000-4000-8000-000000000003') <> 'rented' THEN RAISE EXCEPTION 'Shared equipment freed'; END IF;
  IF (SELECT status FROM public.equipment WHERE id='20000000-0000-4000-8000-000000000004') <> 'free' THEN RAISE EXCEPTION 'Returned equipment not freed'; END IF;
  IF (SELECT status FROM public.equipment WHERE id='20000000-0000-4000-8000-000000000005') <> 'maintenance' THEN RAISE EXCEPTION 'Maintenance cleared'; END IF;
  PERFORM public.record_cancelled_order_refund_atomic(v_id, '20000000-0000-4000-8000-000000000040', 40, 'refund', 'cash', v_admin);
  PERFORM public.record_cancelled_order_refund_atomic(v_id, '20000000-0000-4000-8000-000000000040', 40, 'refund', 'cash', v_admin);
  IF (SELECT count(*) FROM public.payments WHERE order_id=v_id AND payment_type='refund') <> 1 THEN RAISE EXCEPTION 'Retry generated duplicate refund'; END IF;
  BEGIN
    PERFORM public.record_cancelled_order_refund_atomic(v_id, '20000000-0000-4000-8000-000000000041', 61, 'refund', 'cash', v_admin);
    RAISE EXCEPTION 'TEST: over-refund accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  PERFORM public.record_cancelled_order_refund_atomic(v_id, '20000000-0000-4000-8000-000000000042', 60, 'refund', 'transfer', v_admin);
  PERFORM public.record_cancelled_order_refund_atomic(v_id, '20000000-0000-4000-8000-000000000043', 50, 'deposit_return', 'cash', v_admin);
  v_finance := public.get_finance_analytics(current_date, current_date);
  IF (v_finance->'kpi'->>'revenue')::numeric <> 0 THEN RAISE EXCEPTION 'Refunds not subtracted from revenue: %', v_finance->'kpi'; END IF;
  IF (SELECT revenue_today FROM public.v_dashboard_stats) <> 0 THEN RAISE EXCEPTION 'Dashboard refund accounting incorrect'; END IF;
  -- Cancellation without payments must not create an artificial refund.
  PERFORM public.cancel_order_atomic('20000000-0000-4000-8000-000000000013', 'no payment', '[]', v_admin);
  IF EXISTS (SELECT 1 FROM public.payments WHERE order_id='20000000-0000-4000-8000-000000000013') THEN RAISE EXCEPTION 'Unpaid cancellation created payment'; END IF;
  RAISE NOTICE 'Cancellation, snapshot guard, missing kits, payment history, idempotency, refund limits and finance checks passed';
END $$;
ROLLBACK;
