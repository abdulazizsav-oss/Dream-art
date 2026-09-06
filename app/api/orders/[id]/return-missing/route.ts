import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { returnMissingKitSchema } from '@/lib/validations/return-missing'

/**
 * POST /api/orders/[id]/return-missing
 *
 * Клиент принёс ранее не возвращённые элементы комплектации.
 * Переносит указанные элементы из missing_kit_items в returned_kit_items.
 *
 * Body: { items: [{ order_item_id: string, returned_now: string[] }] }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = returnMissingKitSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Укажите позиции заказа и элементы для возврата' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: order } = await service
    .from('orders')
    .select('client_id')
    .eq('id', orderId)
    .single()

  const { data, error } = await service.rpc('return_missing_kit_events_atomic', {
    p_order_id: orderId,
    p_items: parsed.data.items,
    p_marked_returned_by: user.id,
  } as never)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === 'P0001' ? 400 : 500 },
    )
  }

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/clients')
  if (order?.client_id) revalidatePath(`/clients/${order.client_id}`)
  return NextResponse.json({ success: true, ...(data as Record<string, unknown> | null ?? {}) })
}
