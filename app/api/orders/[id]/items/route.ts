import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { orderItemSchema } from '@/lib/validations/order'
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

  const { data, error } = await supabase.rpc('add_order_items_atomic', {
    p_order_id: id,
    p_items: parsed.data.items,
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
