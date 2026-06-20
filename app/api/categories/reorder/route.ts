import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    sort_order: z.number().int().min(0),
  })).min(1),
})

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = reorderSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updates = parsed.data.items.map(item =>
    supabase
      .from('equipment_categories')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id),
  )

  const results = await Promise.all(updates)
  const failed = results.find(result => result.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  revalidatePath('/equipment')
  revalidatePath('/admin/categories')

  return NextResponse.json({ success: true })
}
