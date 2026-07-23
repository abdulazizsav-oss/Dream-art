import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { findPotentialClientDuplicates, normalizeClientName, normalizeClientPhone } from '@/lib/client-duplicates'
import { createClient } from '@/lib/supabase/server'

const querySchema = z.object({
  full_name: z.string().trim().max(160).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  exclude_id: z.string().uuid().optional(),
})

function safeNameTokens(value: string) {
  return Array.from(new Set(normalizeClientName(value)
    .split(' ')
    .filter(token => token.length >= 3)))
    .slice(0, 3)
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { full_name, phone, exclude_id } = parsed.data
  const phoneKey = normalizeClientPhone(phone)
  const nameTokens = safeNameTokens(full_name)
  if (phoneKey.length < 9 && nameTokens.length === 0) return NextResponse.json({ matches: [] })

  const select = 'id, full_name, phone, birth_date'
  const queries = []
  if (phoneKey.length >= 9) {
    queries.push(
      supabase
        .from('clients')
        .select(select)
        .ilike('phone', `%${phoneKey.slice(-7)}%`)
        .limit(20),
    )
  }
  for (const nameToken of nameTokens) {
    queries.push(
      supabase
        .from('clients')
        .select(select)
        .ilike('full_name', `%${nameToken}%`)
        .limit(30),
    )
  }

  const results = await Promise.all(queries)
  const error = results.find(result => result.error)?.error
  if (error) return NextResponse.json({ error: 'Не удалось проверить совпадения клиентов' }, { status: 500 })

  const candidates = Array.from(new Map(
    results.flatMap(result => result.data ?? []).map(client => [client.id, client]),
  ).values())
  const matches = findPotentialClientDuplicates(candidates, { full_name, phone })
    .filter(client => client.id !== exclude_id)
    .slice(0, 5)

  return NextResponse.json({ matches })
}
