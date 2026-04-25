import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { orderItemSchema } from '@/lib/validations/order'
import { normalizeOrderItemsForBilling, OrderPricingError } from '@/lib/orders/pricing'
import { getTashkentDate, getTashkentTime } from '@/lib/utils'
import { z } from 'zod'

const addItemsSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'Добавьте хотя бы одну позицию'),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = addItemsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const service = await createServiceClient()
  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, status, end_date, end_time')
    .eq('id', id)
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? 'Заказ не найден' }, { status: 404 })
  }

  const now = new Date()
  let normalizedItems
  try {
    normalizedItems = await normalizeOrderItemsForBilling(service, parsed.data.items, {
      start_date: getTashkentDate(now),
      end_date: order.end_date < getTashkentDate(now) ? getTashkentDate(now) : order.end_date,
      start_time: getTashkentTime(now),
      end_time: order.end_date < getTashkentDate(now) ? '23:59' : (order.end_time ?? '23:00'),
    })
  } catch (error) {
    if (error instanceof OrderPricingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Ошибка пересчёта суммы дозаказа' }, { status: 500 })
  }

  const { data, error } = await service.rpc('add_order_items_atomic', {
    p_order_id: id,
    p_items: normalizedItems,
    p_added_by: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  revalidatePath('/equipment')

  return NextResponse.json({ success: true, item_ids: data ?? [] }, { status: 201 })
}
