import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const {
    equipment_ids,
    start_date,
    end_date,
    start_time = '09:30',
    end_time = '23:00',
    exclude_order_id,
  } = await req.json()

  if (!equipment_ids?.length || !start_date || !end_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entries = await Promise.all(
    (equipment_ids as string[]).map(async id => {
      const { data, error } = await supabase.rpc('check_equipment_availability_tr', {
        p_equipment_id: id,
        p_start_date: start_date,
        p_start_time: start_time,
        p_end_date: end_date,
        p_end_time: end_time,
        p_exclude_order_id: exclude_order_id ?? null,
      })

      return [id, error ? false : Boolean(data)] as const
    }),
  )

  const results = Object.fromEntries(entries)

  return NextResponse.json(results)
}
