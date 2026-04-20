import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { items, actual_return_date } = body
  // items: [{order_item_id, condition_on_return, return_photo_urls}]

  const rpcArgs: Record<string, unknown> = {
    p_order_id: id,
    p_items: items,
  }
  if (actual_return_date) {
    rpcArgs.p_actual_return_date = actual_return_date
  }

  const { error } = await supabase.rpc('return_order_atomic', rpcArgs as any)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  return NextResponse.json({ success: true })
}
