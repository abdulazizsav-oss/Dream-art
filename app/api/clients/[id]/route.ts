import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { clientSchema } from '@/lib/validations/client'
import { findPotentialClientDuplicates } from '@/lib/client-duplicates'

function invalidateClient(id: string) {
  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = clientSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (parsed.data.phone) {
    const { data: existingClients, error: duplicateCheckError } = await supabase
      .from('clients')
      .select('id, full_name, phone, birth_date')
      .neq('id', id)
      .limit(5_000)
    if (duplicateCheckError) {
      return NextResponse.json({ error: 'Не удалось проверить номер телефона' }, { status: 500 })
    }
    const exactPhoneDuplicate = findPotentialClientDuplicates(existingClients ?? [], parsed.data)
      .find(candidate => candidate.reason === 'exact_phone')
    if (exactPhoneDuplicate) {
      return NextResponse.json({
        error: `Этот телефон уже принадлежит клиенту: ${exactPhoneDuplicate.full_name}`,
        duplicate: exactPhoneDuplicate,
      }, { status: 409 })
    }
  }

  const { data, error } = await supabase.from('clients').update(parsed.data).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidateClient(id)
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidateClient(id)
  return new NextResponse(null, { status: 204 })
}
