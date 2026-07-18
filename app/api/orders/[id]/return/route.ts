import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { computeActiveOrderTotal, type ActiveItemInput } from '@/lib/billing'
import { kitPerShift, sanitizeKitSelection } from '@/lib/kit'
import { z } from 'zod'

const paymentMethodSchema = z.enum(['cash', 'transfer', 'card'])

const returnRequestSchema = z.object({
  items: z.array(z.object({
    order_item_id: z.string().uuid(),
    condition_on_return: z.string().max(1000).optional(),
    return_photo_urls: z.array(z.string().url()).max(20).optional(),
    returned_kit_items: z.array(z.string().max(300)).max(200).optional(),
    missing_kit_items: z.array(z.string().max(300)).max(200).optional(),
    payment_intent: z.enum(['paid', 'unpaid', 'partial']).optional(),
    paid_amount: z.coerce.number().min(0).multipleOf(0.01).optional(),
  }).strict()).min(1, 'Нет позиций для сдачи'),
  payment_splits: z.array(z.object({
    payment_method: paymentMethodSchema,
    amount: z.coerce.number().min(0.01).multipleOf(0.01),
  }).strict()).max(3).optional(),
  payment_notes: z.string().max(2000).nullable().optional(),
  actual_end_at: z.string().datetime({ offset: true }).nullable().optional(),
  delivery_to_client: z.boolean().optional(),
  delivery_from_client: z.boolean().optional(),
}).strict()

function parseActualEndAt(value: string | null | undefined) {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * POST /api/orders/[id]/return
 *
 * Закрывает выбранные позиции заказа (или все) через RPC `return_order_items_with_payments_atomic_v3`.
 * Для каждой позиции рассчитывает final_subtotal по правилам computeActiveOrderTotal:
 *   - manual → сохранённый subtotal
 *   - auto   → computeOrderBilling(actual_start_at → now())
 * Если передана оплата, платежи сразу распределяются по закрываемым позициям.
 * Заказ переводится в `returned` только когда все позиции закрыты.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = await createServiceClient()

  const parsed = returnRequestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const actualEndAt = parseActualEndAt(body.actual_end_at)
  if (!actualEndAt) {
    return NextResponse.json({ error: 'Некорректная дата фактического возврата' }, { status: 400 })
  }

  // 1. Загружаем заказ + все позиции с equipment-ставками
  const { data: order, error: orderErr } = await service
    .from('orders')
    .select('id, client_id, actual_start_at, delivery_fee, delivery_to_client, delivery_from_client, order_delivery_payment_allocations(amount), order_items(id, equipment_id, rate_source, subtotal, manual_subtotal, kit_selection, daily_rate, day_rate_snapshot, night_rate_snapshot, day_units, night_units, shift_type, actual_start_at, actual_end_at, final_subtotal, final_day_units, final_night_units, returned, order_item_payment_allocations(amount), equipment(day_rate, night_rate, daily_rate, day_night))')
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
    manual_subtotal: number | null
    kit_selection: unknown
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
    order_item_payment_allocations: { amount: number | null }[] | null
    equipment: { day_rate: number | null; night_rate: number | null; daily_rate: number | null; day_night: 'day' | 'night' | 'both' | null } | null
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
      day_night: it.equipment?.day_night ?? null,
      subtotal: it.subtotal ?? 0,
      day_units: it.day_units ?? 0,
      night_units: it.night_units ?? 0,
      shift_type: it.shift_type ?? 'day',
      manual_subtotal: it.manual_subtotal ?? null,
      kit_per_shift: kitPerShift(sanitizeKitSelection(it.kit_selection)),
    }
  })

  const live = computeActiveOrderTotal({ now: actualEndAt, items: inputs })

  // 3. Готовим payload для RPC — только для тех позиций, что сдаются сейчас
  const requestedIds = new Set(body.items.map(i => i.order_item_id))
  const hasPaymentIntent = body.items.some(item => item.payment_intent !== undefined)
  let expectedPaidTotal = 0
  const itemsForRpc = body.items
    .map(req => {
      const src = allItems.find(it => it.id === req.order_item_id)
      if (!src || src.returned) return null
      const calc = live.perItem.get(req.order_item_id)
      if (!calc) return null
      const existingPaid = (src.order_item_payment_allocations ?? [])
        .reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0)
      const remainingDue = Math.max(calc.subtotal - existingPaid, 0)
      const rawPaidAmount =
        req.payment_intent === 'paid'
          ? remainingDue
          : req.payment_intent === 'unpaid'
            ? 0
            : Number(req.paid_amount ?? 0)
      const paidAmount = Math.max(0, Math.min(remainingDue, rawPaidAmount))
      expectedPaidTotal += paidAmount
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
        paid_amount: paidAmount,
      }
    })
    .filter(Boolean)

  if (itemsForRpc.length === 0) {
    return NextResponse.json({ error: 'Нет валидных позиций для сдачи' }, { status: 400 })
  }

  const paymentSplits = body.payment_splits ?? []

  const splitTotal = paymentSplits.reduce((sum, split) => sum + split.amount, 0)
  if (hasPaymentIntent && Math.abs(splitTotal - expectedPaidTotal) > 0.01) {
    return NextResponse.json(
      {
        error: expectedPaidTotal > 0
          ? 'Сумма оплаты не совпадает с выбранными позициями'
          : 'Для неоплаченной сдачи не нужно передавать платежи',
      },
      { status: 400 },
    )
  }

  const { data: rpcData, error: rpcErr } = await service.rpc('return_order_items_with_payments_atomic_v3', {
    p_order_id: id,
    p_items: itemsForRpc,
    p_payment_splits: paymentSplits,
    p_created_by: user.id,
    p_notes: body.payment_notes ?? null,
    p_actual_end_at: actualEndAt.toISOString(),
    p_delivery_to_client: body.delivery_to_client ?? Boolean(o.delivery_to_client),
    p_delivery_from_client: body.delivery_from_client ?? Boolean(o.delivery_from_client),
  } as never)

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  revalidatePath('/finance')
  revalidatePath('/clients')
  if ((o as { client_id?: string | null }).client_id) {
    revalidatePath(`/clients/${(o as { client_id: string }).client_id}`)
  }

  // Частичная или полная?
  const remaining = allItems.filter(it => !it.returned && !requestedIds.has(it.id)).length
  return NextResponse.json({
    success: true,
    closed: (rpcData as any)?.closed ?? itemsForRpc.length,
    order_closed: (rpcData as any)?.order_closed ?? remaining === 0,
    paid_total: (rpcData as any)?.paid_total ?? splitTotal,
    delivery_paid_total: (rpcData as any)?.delivery_paid_total ?? 0,
  })
}
