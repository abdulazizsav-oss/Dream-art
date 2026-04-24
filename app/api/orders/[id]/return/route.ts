import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { computeOrderBilling, type BillingItemInput } from '@/lib/billing'
import { getTashkentDate } from '@/lib/utils'

/**
 * POST /api/orders/[id]/return
 *
 * Закрывает заказ с авто-перерасчётом смен через единую функцию `computeOrderBilling`:
 *   start = actual_start_at (фактическое открытие)
 *   end   = now() (фактическое закрытие)
 *
 * Manual-позиции оставляются как есть (только статус возврата).
 * Auto-позиции пересчитываются: day_units, night_units, subtotal.
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
    actual_return_date?: string | null
  }

  // 1. Загружаем заказ + позиции + equipment
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, start_date, start_time, actual_start_at, order_items(id, equipment_id, shift_type, rate_source, subtotal, daily_rate, day_rate_snapshot, night_rate_snapshot, equipment(day_rate, night_rate, daily_rate))')
    .eq('id', id)
    .single()

  if (orderErr || !order) return NextResponse.json({ error: orderErr?.message ?? 'Заказ не найден' }, { status: 404 })

  // 2. Фактические timestamps: start = actual_start_at (или плановые start_date+start_time), end = now()
  const o = order as any
  const startDate: Date = o.actual_start_at
    ? new Date(o.actual_start_at)
    : new Date(`${o.start_date}T${o.start_time ?? '09:30'}:00+05:00`)
  const endDate = new Date()

  const orderItems = (o.order_items ?? []) as Array<{
    id: string
    equipment_id: string
    shift_type: 'day' | 'night' | null
    rate_source: 'auto' | 'manual' | null
    subtotal: number | null
    daily_rate: number | null
    day_rate_snapshot: number | null
    night_rate_snapshot: number | null
    equipment: { day_rate: number | null; night_rate: number | null; daily_rate: number } | null
  }>

  // 3. Собираем billing-input только для auto-позиций
  const autoItems = orderItems.filter(it => it.rate_source !== 'manual')
  const manualItems = orderItems.filter(it => it.rate_source === 'manual')

  const billingInputs: BillingItemInput[] = autoItems.map(it => {
    const dayRate = it.equipment?.day_rate ?? it.day_rate_snapshot ?? it.equipment?.daily_rate ?? it.daily_rate ?? 0
    const nightRate = it.equipment?.night_rate ?? it.night_rate_snapshot ?? dayRate
    return { equipment_id: it.equipment_id, day_rate: dayRate, night_rate: nightRate }
  })

  // 4. Единый расчёт
  const billing = computeOrderBilling({ start: startDate, end: endDate, items: billingInputs })

  // 5. Применяем к auto-позициям
  let newTotal = 0
  for (let i = 0; i < autoItems.length; i++) {
    const src = autoItems[i]
    const calc = billing.items[i]
    const dayRate = calc.day_rate
    const nightRate = calc.night_rate
    const effectiveRate = calc.shift_type === 'night' ? nightRate : dayRate

    const { error: updErr } = await supabase
      .from('order_items')
      .update({
        day_units: calc.day_units,
        night_units: calc.night_units,
        days: calc.day_units + calc.night_units,
        subtotal: calc.subtotal,
        shift_type: calc.shift_type,
        daily_rate: effectiveRate,
        day_rate_snapshot: dayRate,
        night_rate_snapshot: nightRate,
      } as never)
      .eq('id', src.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    newTotal += calc.subtotal
  }

  // Manual-позиции учитываем в total как есть
  for (const m of manualItems) newTotal += m.subtotal ?? 0

  // 6. Обновляем total_amount заказа (если был перерасчёт)
  if (autoItems.length > 0) {
    const { error: totErr } = await supabase
      .from('orders')
      .update({ total_amount: newTotal } as never)
      .eq('id', id)
    if (totErr) return NextResponse.json({ error: totErr.message }, { status: 500 })
  }

  // 7. RPC возврата — фиксирует kit items, статус, actual_end_at
  const endLocalDate = getTashkentDate(endDate)
  const { error: rpcErr } = await supabase.rpc('return_order_atomic', {
    p_order_id: id,
    p_items: body.items,
    p_actual_return_date: body.actual_return_date ?? endLocalDate,
  } as any)

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  revalidatePath('/finance')

  return NextResponse.json({
    success: true,
    recalculated: autoItems.length,
    new_total: newTotal,
    breakdown: billing.explanation,
  })
}
