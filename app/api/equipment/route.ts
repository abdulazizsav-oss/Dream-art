import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { equipmentSchema } from '@/lib/validations/equipment'
import type { EquipmentStatus } from '@/types/database'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  let query = supabase
    .from('equipment')
    .select('*, equipment_categories(name, slug, is_active)')
    .order('name')

  if (category) query = query.eq('category_id', category)
  if (status) query = query.eq('status', status as EquipmentStatus)
  if (search) {
    const safeSearch = search.replaceAll(',', ' ')
    query = query.or(`name.ilike.%${safeSearch}%,brand.ilike.%${safeSearch}%,specs.ilike.%${safeSearch}%,notes.ilike.%${safeSearch}%`)
  }

  const result = await query
  if (!result.error) return NextResponse.json(result.data)

  let fallbackQuery = supabase
    .from('equipment')
    .select('*, equipment_categories(name, slug)')
    .order('name')

  if (category) fallbackQuery = fallbackQuery.eq('category_id', category)
  if (status) fallbackQuery = fallbackQuery.eq('status', status as EquipmentStatus)
  if (search) fallbackQuery = fallbackQuery.ilike('name', `%${search}%`)

  const fallback = await fallbackQuery
  if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
  return NextResponse.json(fallback.data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = equipmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const payload = {
    ...parsed.data,
    daily_rate: parsed.data.day_rate,
  }

  const { data, error } = await supabase
    .from('equipment')
    .insert(payload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/equipment')
  revalidatePath('/dashboard')

  return NextResponse.json(data, { status: 201 })
}
