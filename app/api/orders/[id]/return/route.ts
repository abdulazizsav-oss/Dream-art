import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBillingBreakdown, getEquipmentRate, getItemShiftType } from '@/lib/rental'
import { getTashkentDate, getTashkentTime } from '@/lib/utils'

/**
 * POST /api/orders/[id]/return
 *
 * Закрывает заказ с авто-перерасчётом смен на основе фактических timestamps:
 *   actual_start_at  → (дата, время) открытия
 *   now() в Ташкенте → (дата, время) закрытия
 *
 * Если позиция была `manual` — оставляем её ставку/количество как есть,
 * только отмечаем возврат. Иначе пересчитываем day_units/night_units/subtotal.
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

  // 1. Загружаем заказ + позиции + equipment для перерасчёта
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, start_date, end_date, start_time, actual_start_at, order_items(id, equipment_id, shift_type, rate_source, daily_rate, day_rate_snapshot, night_rate_snapshot, equipment(day_rate, night_rate, daily_rate))')
    .eq('id', id)
    .single()

  if (orderErr || !order) return NextResponse.json({ error: orderErr?.message ?? 'Заказ не найден' }, { status: 404 })

  // 2. Определяем фактические дата/время открытия и закрытия (в зоне Ташкента)
  const actualStartAt = (order as any).actual_start_at as string | null
  const startSource = actualStartAt ? new Date(actualStartAt) : new Date(`${(order as any).start_date}T${(order as any).start_time ?? '09:30'}:00+05:00`)

  const now = new Date()
  const computedStartDate = getTashkentDate(startSource)
  const computedStartTime = getTashkentTime(startSource)
  const computedEndDate = getTashkentDate(now)
  const computedEndTime = getTashkentTime(now)

  // 3. Пересчитываем каждую позицию (только auto; manual — оставляем)
  const orderItems = ((order as any).order_items ?? []) as Array<{
    id: string
    equipment_id: string
    shift_type: 'day' | 'night' | null
    rate_source: 'auto' | 'manual' | null
    daily_rate: number
    day_rate_snapshot: number | null
    night_rate_snapshot: number | null
    equipment: { day_rate: number | null; night_rate: number | null; daily_rate: number } | null
  }>

  let newTotal = 0
  const itemUpdates: Array<{
    id: string
    day_units: number
    night_units: number
    days: number
    subtotal: number
    shift_type: 'day' | 'night'
    daily_rate: number
    day_rate_snapshot: number
    night_rate_snapshot: number
  }> = []

  for (const it of orderItems) {
    const eq = it.equipment
    const isManual = it.rate_source === 'manual'
    const dayRate = eq?.day_rate ?? it.day_rate_snapshot ?? eq?.daily_rate ?? it.daily_rate ?? 0
    const nightRate = eq?.night_rate ?? it.night_rate_snapshot ?? dayRate

    if (isManual) {
      // Оставляем manual-позицию как есть, но учитываем в total
      const manualSubtotal = (it as any).subtotal ?? 0
      newTotal += manualSubtotal
      continue
    }

    const shiftType = getItemShiftType(
      { shift_type: it.shift_type ?? 'day', rate_source: 'auto' },
      {
        start_date: computedStartDate,
        end_date: computedEndDate,
        start_time: computedStartTime,
        end_time: computedEndTime,
      },
    )

    const breakdown = getBillingBreakdown(
      computedStartDate,
      computedEndDate,
      computedStartTime,
      computedEndTime,
      'auto',
      shiftType,
    )

    const effectiveRate = getEquipmentRate(
      { day_rate: dayRate, night_rate: nightRate, daily_rate: it.daily_rate ?? dayRate },
      shiftType,
    )

    const subtotal = dayRate * breakdown.dayUnits + nightRate * breakdown.nightUnits

    itemUpdates.push({
      id: it.id,
      day_units: breakdown.dayUnits,
      night_units: breakdown.nightUnits,
      days: breakdown.totalUnits,
      subtotal,
      shift_type: shiftType,
      daily_rate: effectiveRate,
      day_rate_snapshot: dayRate,
      night_rate_snapshot: nightRate,
    })
    newTotal += subtotal
  }

  // 4. Применяем обновления позиций
  for (const u of itemUpdates) {
    const { error: updErr } = await supabase
      .from('order_items')
      .update({
        day_units: u.day_units,
        night_units: u.night_units,
        days: u.days,
        subtotal: u.subtotal,
        shift_type: u.shift_type,
        daily_rate: u.daily_rate,
        day_rate_snapshot: u.day_rate_snapshot,
        night_rate_snapshot: u.night_rate_snapshot,
      } as never)
      .eq('id', u.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // 5. Обновляем общую сумму заказа
  if (itemUpdates.length > 0) {
    const { error: totErr } = await supabase
      .from('orders')
      .update({ total_amount: newTotal } as never)
      .eq('id', id)
    if (totErr) return NextResponse.json({ error: totErr.message }, { status: 500 })
  }

  // 6. Вызываем RPC возврата — он запишет kit items + статус + actual_end_at
  const { error: rpcErr } = await supabase.rpc('return_order_atomic', {
    p_order_id: id,
    p_items: body.items,
    p_actual_return_date: body.actual_return_date ?? computedEndDate,
  } as any)

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  revalidatePath('/finance')
  return NextResponse.json({
    success: true,
    recalculated: itemUpdates.length,
    new_total: newTotal,
  })
}
