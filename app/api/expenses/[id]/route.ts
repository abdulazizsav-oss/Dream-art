import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/supabase/getRole'

const expensePatchSchema = z.object({
  category: z.enum(['maintenance', 'purchase', 'salary', 'rent', 'tax', 'marketing', 'transport', 'other']).optional(),
  description: z.string().trim().max(500).optional(),
  amount: z.coerce.number().positive().optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payment_method: z.enum(['cash', 'transfer', 'card']).optional(),
  equipment_id: z.string().uuid().nullable().optional(),
})

async function requireSuperAdmin() {
  const profile = await getMyProfile()
  if (!profile) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (profile.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { profile }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return auth.error

  const parsed = expensePatchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expenses')
    .update(parsed.data as never)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/finance')
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return auth.error

  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/finance')
  return new NextResponse(null, { status: 204 })
}
