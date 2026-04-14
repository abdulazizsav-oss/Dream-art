import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const paymentSchema = z.object({
  order_id: z.string().uuid(),
  amount: z.coerce.number().min(0.01),
  payment_method: z.enum(['cash', 'transfer', 'card']).default('cash'),
  payment_type: z.enum(['rental', 'deposit', 'deposit_return', 'extra', 'fine']).default('rental'),
  notes: z.string().nullable().optional(),
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

  const { data, error } = await supabase
    .from('payments')
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
