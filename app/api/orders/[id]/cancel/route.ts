import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cancellationSchema } from '@/lib/orders/cancellation'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = cancellationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { data, error } = await createServiceClient().rpc('cancel_order_atomic', {
    p_order_id: id, p_reason: parsed.data.reason, p_items: parsed.data.items, p_created_by: user.id,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  for (const path of ['/orders', `/orders/${id}`, '/clients', '/equipment', '/calendar', '/finance', '/dashboard']) revalidatePath(path)
  revalidatePath('/clients/[id]', 'page')
  return NextResponse.json(data)
}
