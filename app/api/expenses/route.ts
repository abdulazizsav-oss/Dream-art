import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/supabase/getRole'

const expenseSchema = z.object({
  category: z.enum(['maintenance', 'purchase', 'salary', 'rent', 'tax', 'marketing', 'transport', 'other']),
  description: z.string().trim().max(500).default(''),
  amount: z.coerce.number().positive(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(['cash', 'transfer', 'card']).default('cash'),
  equipment_id: z.string().uuid().nullable().optional(),
})

export async function GET(req: NextRequest) {
  const profile = await getMyProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const supabase = await createClient()

  let query = supabase
    .from('expenses')
    .select('*, equipment(name), created_by_profile:user_profiles!expenses_created_by_profile_fk(full_name)')
    .order('expense_date', { ascending: false })

  if (from) query = query.gte('expense_date', from)
  if (to) query = query.lte('expense_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const profile = await getMyProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Только главный администратор может добавлять расходы' }, { status: 403 })
  }

  const parsed = expenseSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      ...parsed.data,
      equipment_id: parsed.data.equipment_id || null,
      created_by: profile.id,
      currency: 'UZS',
    } as never)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/finance')
  return NextResponse.json(data, { status: 201 })
}
