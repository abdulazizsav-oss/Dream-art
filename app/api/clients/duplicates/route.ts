import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  findPotentialClientDuplicates,
  normalizeClientName,
  normalizeClientPhone,
  type ClientDuplicateCandidate,
} from '@/lib/client-duplicates'
import { createClient } from '@/lib/supabase/server'

const querySchema = z.object({
  full_name: z.string().trim().max(160).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  exclude_id: z.string().uuid().optional(),
})

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { full_name, phone, exclude_id } = parsed.data
  const phoneKey = normalizeClientPhone(phone)
  if (phoneKey.length < 7 && normalizeClientName(full_name).length < 3) {
    return NextResponse.json({ matches: [] })
  }

  // Raw ILIKE не умеет сопоставить Begzod/Бегзод и пропускает номер, если один
  // вариант хранится с дефисами. Загружаем лёгкие поля страницами и применяем
  // один и тот же канонический matcher, что и в интерфейсе.
  const candidates: ClientDuplicateCandidate[] = []
  const pageSize = 500
  for (let offset = 0; offset < 5_000; offset += pageSize) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, phone, birth_date')
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (error) {
      return NextResponse.json({ error: 'Не удалось проверить совпадения клиентов' }, { status: 500 })
    }
    candidates.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }

  const matches = findPotentialClientDuplicates(candidates, { full_name, phone })
    .filter(client => client.id !== exclude_id)
    .slice(0, 5)

  return NextResponse.json({ matches })
}
