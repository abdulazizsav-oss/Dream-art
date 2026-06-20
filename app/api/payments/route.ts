import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const methodEnum = z.enum(['cash', 'transfer', 'card'])
const typeEnum = z.enum(['rental', 'deposit', 'deposit_return', 'extra', 'fine'])

const splitSchema = z.object({
  amount: z.coerce.number().min(0.01),
  payment_method: methodEnum,
})

const paymentSchema = z.object({
  order_id: z.string().uuid(),
  amount: z.coerce.number().min(0.01).optional(),
  payment_method: methodEnum.default('cash'),
  payment_type: typeEnum.default('rental'),
  notes: z.string().nullable().optional(),
  splits: z.array(splitSchema).min(1).optional(),
})

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get('order_id')

  let query = supabase
    .from('payments')
    .select('*, orders(order_number, clients(full_name))')
    .order('paid_at', { ascending: false })

  if (orderId) query = query.eq('order_id', orderId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = paymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { order_id, payment_type, notes, splits, amount, payment_method } = parsed.data

  // Normalize to an array for legacy clients and the split-payment form.
  const normalized = splits && splits.length > 0
    ? splits
    : amount != null
      ? [{ amount, payment_method }]
      : []

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'Укажите сумму платежа' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service.rpc('add_order_payment_with_allocations_atomic', {
    p_order_id: order_id,
    p_payment_type: payment_type,
    p_splits: normalized,
    p_created_by: user.id,
    p_notes: notes ?? null,
  } as never)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/finance')
  revalidatePath('/orders')
  revalidatePath(`/orders/${order_id}`)
  revalidatePath('/dashboard')

  return NextResponse.json(data, { status: 201 })
}
