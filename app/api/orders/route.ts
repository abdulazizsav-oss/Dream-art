import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { orderSchema } from '@/lib/validations/order'
import { sendOrderConfirmation } from '@/lib/bot/notifications'
import type { OrderStatus } from '@/types/database'

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
    start_time,
    end_time,
    deposit_amount,
    notes,
    items,
    trusted_person,
    trusted_person_doc_type,
  } = parsed.data

  const { data: orderId, error } = await supabase.rpc('create_order_atomic', {
    p_client_id: client_id,
    p_start_date: start_date,
    p_end_date: end_date,
    p_start_time: start_time,
    p_end_time: end_time,
    p_deposit_amount: deposit_amount ?? 0,
    p_notes: notes ?? '',
    p_created_by: user.id,
    p_items: items,
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
  await supabase.from('orders').update(updatePayload as never).eq('id', orderId as string)

  // Fetch created order for response + notifications
  const { data: order } = await supabase
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
