import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildClientOrderAlertSummary, type ClientAlertOrder } from '@/lib/client-order-alerts'
import {
  buildLegacyMissingKitEvents,
  buildMissingKitByClient,
  mergeMissingKitEvents,
  type LegacyMissingKitOrderRow,
  type MissingKitEventRow,
} from '@/lib/missing-kit'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Некорректный клиент' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: client, error: clientError }, { data: orders, error: ordersError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from('clients').select('id').eq('id', id).single(),
    supabase
      .from('orders')
      .select('id, order_number, client_id, status, delivery_fee, created_at, updated_at, actual_end_at, actual_return_date, payments(amount, payment_type), order_items(id, subtotal, final_subtotal, returned, missing_kit_items, actual_end_at, equipment(name))')
      .eq('client_id', id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('order_item_missing_kit_events')
      .select('id, order_id, order_item_id, kit_name, missing_since, returned_at, orders!inner(id, order_number, client_id, status, created_at), order_items(id, equipment(name))')
      .eq('orders.client_id', id)
      .is('returned_at', null)
      .order('missing_since', { ascending: false }),
  ])

  if (clientError || !client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })
  if (ordersError || eventsError) {
    return NextResponse.json({ error: 'Не удалось получить историю клиента' }, { status: 500 })
  }

  const orderRows = (orders ?? []) as unknown as ClientAlertOrder[]
  const missingEvents = mergeMissingKitEvents(
    (events ?? []) as unknown as MissingKitEventRow[],
    buildLegacyMissingKitEvents((orders ?? []) as unknown as LegacyMissingKitOrderRow[]),
  )
  const missing = buildMissingKitByClient(missingEvents).get(id)
  const summary = buildClientOrderAlertSummary(orderRows, missing
    ? { total: missing.total, names: missing.names }
    : null)

  return NextResponse.json(summary)
}

