import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { clientSchema } from '@/lib/validations/client'
import { clientMatchesSearch, findPotentialClientDuplicates } from '@/lib/client-duplicates'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')

  const { data, error } = await supabase.from('clients').select('*').order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(search ? (data ?? []).filter(client => clientMatchesSearch(client, search)) : data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = clientSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: existingClients, error: duplicateCheckError } = await supabase
    .from('clients')
    .select('id, full_name, phone, birth_date')
    .limit(5_000)
  if (duplicateCheckError) {
    return NextResponse.json({ error: 'Не удалось проверить номер телефона' }, { status: 500 })
  }
  const exactPhoneDuplicate = findPotentialClientDuplicates(existingClients ?? [], parsed.data)
    .find(candidate => candidate.reason === 'exact_phone')
  if (exactPhoneDuplicate) {
    return NextResponse.json({
      error: `Клиент с таким телефоном уже существует: ${exactPhoneDuplicate.full_name}`,
      duplicate: exactPhoneDuplicate,
    }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...parsed.data, created_by: user.id } as never)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/clients')
  revalidatePath('/dashboard')

  return NextResponse.json(data, { status: 201 })
}
