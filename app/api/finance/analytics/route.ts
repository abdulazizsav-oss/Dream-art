import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/supabase/getRole'
import { getTashkentDate } from '@/lib/utils'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`
}

export async function GET(req: NextRequest) {
  const profile = await getMyProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = getTashkentDate()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? monthStart(today)
  const to = searchParams.get('to') ?? today

  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    return NextResponse.json({ error: 'Некорректный период' }, { status: 400 })
  }

  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  ) + 1
  if (days > 3660) {
    return NextResponse.json({ error: 'Период не может превышать 10 лет' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_finance_analytics', {
    p_from: from,
    p_to: to,
  } as never)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
