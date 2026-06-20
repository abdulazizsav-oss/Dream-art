import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { orderSchema } from '@/lib/validations/order'
import { sendOrderConfirmation } from '@/lib/bot/notifications'
import type { OrderStatus } from '@/types/database'
import { normalizeOrderItemsForBilling, OrderPricingError } from '@/lib/orders/pricing'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const clientId = searchParams.get('client_id')
  const search = searchParams.get('search')

  let query = supabase
    .from('orders')
    .select('*, clients(full_name, phone, telegram_chat_id)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status as OrderStatus)
  if (clientId) query = query.eq('client_id', clientId)
  if (search) query = query.ilike('order_number', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = orderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const {
    client_id,
    start_date,
    end_date,
    deposit_amount,
    notes,
    items,
    trusted_person,
    trusted_person_doc_type,
  } = parsed.data
  const service = await createServiceClient()

  let normalizedItems
  try {
    normalizedItems = await normalizeOrderItemsForBilling(service, items, {
      start_date,
      end_date,
      start_time: '',
      end_time: '',
    })
  } catch (error) {
    if (error instanceof OrderPricingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Ошибка пересчёта суммы заказа' }, { status: 500 })
  }

  // Время не собираем на форме — расчёт суммы идёт от actual_start_at → now() при закрытии.
  // Для RPC передаём пустые строки: внутри COALESCE(NULLIF(...,'')::time, '09:30'/'23:00'::time)
  const { data: orderId, error } = await service.rpc('create_order_atomic', {
    p_client_id: client_id,
    p_start_date: start_date,
    p_end_date: end_date,
    p_start_time: '',
    p_end_time: '',
    p_deposit_amount: deposit_amount ?? 0,
    p_notes: notes ?? '',
    p_created_by: user.id,
    p_items: normalizedItems,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Сохраняем доверенное лицо + фактическое время открытия заказа
  const updatePayload: Record<string, unknown> = {
    actual_start_at: new Date().toISOString(),
  }
  if (trusted_person || trusted_person_doc_type) {
    updatePayload.trusted_person = trusted_person ?? null
    updatePayload.trusted_person_doc_type = trusted_person_doc_type ?? null
  }
  const { error: updateError } = await service.from('orders').update(updatePayload as never).eq('id', orderId as string)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Ручные цены позиций (frozen amounts). Колонка добавлена миграцией 021.
  // Заморожённая сумма уже учтена в subtotal/total_amount; здесь сохраняем флаг,
  // чтобы при закрытии заказа итог не пересчитывался по факт. длительности.
  // Не критично для создания заказа — ошибки логируем, но не валим запрос.
  const manualByEquipment = new Map<string, number>()
  for (const it of normalizedItems) {
    if (it.manual_subtotal != null) manualByEquipment.set(it.equipment_id, it.manual_subtotal)
  }
  for (const [equipmentId, amount] of manualByEquipment) {
    const { error: manualErr } = await service
      .from('order_items')
      .update({ manual_subtotal: amount } as never)
      .eq('order_id', orderId as string)
      .eq('equipment_id', equipmentId)
    if (manualErr) console.error('manual_subtotal update failed', manualErr.message)
  }

  // Fetch created order for response + notifications
  const { data: order } = await service
    .from('orders')
    .select('*, clients(*), order_items(*, equipment(name))')
    .eq('id', orderId as string)
    .single()

  // Fire Telegram notification (non-blocking)
  if (order) {
    sendOrderConfirmation(order as unknown as Parameters<typeof sendOrderConfirmation>[0]).catch(console.error)
  }

  revalidatePath('/orders')
  revalidatePath('/dashboard')
  revalidatePath('/calendar')
  revalidatePath('/equipment')

  return NextResponse.json(order, { status: 201 })
}
