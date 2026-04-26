import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

type PaymentMethod = 'cash' | 'transfer' | 'card'

const PAYMENT_METHODS = new Set<PaymentMethod>(['cash', 'transfer', 'card'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    payment_splits?: { payment_method: PaymentMethod; amount: number }[]
    notes?: string | null
  }

  const paymentSplits = (body.payment_splits ?? [])
    .map(split => ({
      payment_method: split.payment_method,
      amount: Number(split.amount),
    }))
    .filter(split => split.amount > 0)

  if (paymentSplits.length === 0) {
    return NextResponse.json({ error: 'Укажите сумму платежа' }, { status: 400 })
  }

  if (paymentSplits.some(split => !PAYMENT_METHODS.has(split.payment_method))) {
    return NextResponse.json({ error: 'Некорректный способ оплаты' }, { status: 400 })
  }

  const service = await createServiceClient()
  const { data, error } = await service.rpc('pay_order_item_atomic', {
    p_order_id: id,
    p_order_item_id: itemId,
    p_payment_splits: paymentSplits,
    p_created_by: user.id,
    p_notes: body.notes ?? null,
  } as never)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/finance')
  revalidatePath('/dashboard')

  return NextResponse.json({ success: true, ...(data as Record<string, unknown>) })
}
