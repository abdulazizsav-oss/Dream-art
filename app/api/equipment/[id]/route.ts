import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { equipmentSchema } from '@/lib/validations/equipment'

function invalidateEquipment(id: string) {
  revalidatePath('/equipment')
  revalidatePath(`/equipment/${id}`)
  revalidatePath('/dashboard')
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment')
    .select('*, equipment_categories(name, slug), equipment_maintenance(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = equipmentSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const payload = {
    ...parsed.data,
    ...(parsed.data.day_rate !== undefined ? { daily_rate: parsed.data.day_rate } : {}),
  }

  const { data, error } = await supabase
    .from('equipment')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidateEquipment(id)
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('equipment').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidateEquipment(id)
  return new NextResponse(null, { status: 204 })
}
