import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const deliveryUpdateSchema = z.object({
  fulfillment_method: z.enum(['pickup', 'delivery']),
  delivery_address: z.string().trim().max(500).nullable(),
  delivery_fee: z.coerce.number().int().min(0),
}).strict().superRefine((data, ctx) => {
  if (data.fulfillment_method === 'delivery' && !data.delivery_address) {
    ctx.addIssue({
      code: 'custom',
      path: ['delivery_address'],
      message: 'Укажите адрес доставки',
    })
  }
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Некорректный идентификатор заказа' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = deliveryUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const normalized = parsed.data.fulfillment_method === 'pickup'
    ? {
        fulfillment_method: 'pickup' as const,
        delivery_address: null,
        delivery_fee: 0,
      }
    : parsed.data

  const service = createServiceClient()
  const { data, error } = await service.rpc('update_order_delivery_atomic', {
    p_order_id: id,
    p_fulfillment_method: normalized.fulfillment_method,
    p_delivery_address: normalized.delivery_address,
    p_delivery_fee: normalized.delivery_fee,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/finance')
  revalidatePath('/calendar')

  return NextResponse.json(data)
}
