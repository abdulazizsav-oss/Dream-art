import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cancellationRefundSchema } from '@/lib/orders/cancellation'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = cancellationRefundSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте сумму и способ возврата' }, { status: 400 })
  const { request_id, amount, payment_type, payment_method } = parsed.data
  const { data, error } = await createServiceClient().rpc('record_cancelled_order_refund_atomic', {
    p_order_id: id, p_request_id: request_id, p_amount: amount, p_payment_type: payment_type,
    p_payment_method: payment_method, p_created_by: user.id,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  for (const path of ['/orders', `/orders/${id}`, '/clients', '/finance', '/dashboard']) revalidatePath(path)
  revalidatePath('/clients/[id]', 'page')
  return NextResponse.json({ id: data })
}
