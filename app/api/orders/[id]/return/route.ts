import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { computeActiveOrderTotal, type ActiveItemInput } from '@/lib/billing'

/**
 * POST /api/orders/[id]/return
 *
 * Закрывает выбранные позиции заказа (или все) через RPC `return_order_items_atomic`.
 * Для каждой позиции рассчитывает final_subtotal по правилам computeActiveOrderTotal:
 *   - manual → сохранённый subtotal
 *   - auto   → computeOrderBilling(actual_start_at → now())
 * Заказ переводится в `returned` только когда все позиции закрыты.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    items: {
      order_item_id: string
      condition_on_return?: string
      return_photo_urls?: string[]
      returned_kit_items?: string[]
      missing_kit_items?: string[]
    }[]
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Нет позиций для сдачи' }, { status: 400 })
  }

  // 1. Загружаем заказ + все позиции с equipment-ставками
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, actual_start_at, order_items(id, equipment_id, rate_source, subtotal, daily_rate, day_rate_snapshot, night_rate_snapshot, day_units, night_units, shift_type, actual_start_at, actual_end_at, final_subtotal, final_day_units, final_night_units, returned, equipment(day_rate, night_rate, daily_rate))')
    .eq('id', id)
    .single()

  if (orderErr || !order) {
    return NextResponse.json({ error: orderErr?.message ?? 'Заказ не найден' }, { status: 404 })
  }

  const o = order as any
  const allItems = (o.order_items ?? []) as Array<{
    id: string
    equipment_id: string
    rate_source: 'auto' | 'manual' | null
    subtotal: number | null
    daily_rate: number | null
    day_rate_snapshot: number | null
    night_rate_snapshot: number | null
    day_units: number | null
    night_units: number | null
    shift_type: 'day' | 'night' | null
    actual_start_at: string | null
    actual_end_at: string | null
    final_subtotal: number | null
    final_day_units: number | null
    final_night_units: number | null
    returned: boolean | null
    equipment: { day_rate: number | null; night_rate: number | null; daily_rate: number | null } | null
  }>

  // 2. Live-расчёт по всем позициям, чтобы вытащить freshly-computed subtotals
  const inputs: ActiveItemInput[] = allItems.map(it => {
    const dayRate = it.equipment?.day_rate ?? it.day_rate_snapshot ?? it.equipment?.daily_rate ?? it.daily_rate ?? 0
    const nightRate = it.equipment?.night_rate ?? it.night_rate_snapshot ?? null
    return {
      id: it.id,
      equipment_id: it.equipment_id,
      rate_source: it.rate_source,
      actual_start_at: it.actual_start_at ?? o.actual_start_at ?? null,
      actual_end_at: it.actual_end_at,
      final_subtotal: it.final_subtotal,
      final_day_units: it.final_day_units,
      final_night_units: it.final_night_units,
      day_rate: dayRate,
      night_rate: nightRate,
      subtotal: it.subtotal ?? 0,
      day_units: it.day_units ?? 0,
      night_units: it.night_units ?? 0,
      shift_type: it.shift_type ?? 'day',
    }
  })

  const live = computeActiveOrderTotal({ now: new Date(), items: inputs })

  // 3. Готовим payload для RPC — только для тех позиций, что сдаются сейчас
  const requestedIds = new Set(body.items.map(i => i.order_item_id))
  const itemsForRpc = body.items
    .map(req => {
      const src = allItems.find(it => it.id === req.order_item_id)
      if (!src || src.returned) return null
      const calc = live.perItem.get(req.order_item_id)
      if (!calc) return null
      return {
        order_item_id: req.order_item_id,
        condition_on_return: req.condition_on_return ?? null,
        return_photo_urls: req.return_photo_urls ?? [],
        returned_kit_items: req.returned_kit_items ?? [],
        missing_kit_items: req.missing_kit_items ?? [],
        final_subtotal: calc.subtotal,
        final_day_units: calc.day_units,
        final_night_units: calc.night_units,
        shift_type: calc.shift_type,
      }
    })
    .filter(Boolean)

  if (itemsForRpc.length === 0) {
    return NextResponse.json({ error: 'Нет валидных позиций для сдачи' }, { status: 400 })
  }

  const { error: rpcErr } = await supabase.rpc('return_order_items_atomic', {
    p_order_id: id,
    p_items: itemsForRpc,
  } as never)

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  revalidatePath('/finance')

  // Частичная или полная?
  const remaining = allItems.filter(it => !it.returned && !requestedIds.has(it.id)).length
  return NextResponse.json({
    success: true,
    closed: itemsForRpc.length,
    order_closed: remaining === 0,
  })
}
