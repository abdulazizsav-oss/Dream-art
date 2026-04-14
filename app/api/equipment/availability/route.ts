import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { equipment_ids, start_date, end_date, exclude_order_id } = await req.json()

  if (!equipment_ids?.length || !start_date || !end_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const results: Record<string, boolean> = {}

  for (const id of equipment_ids) {
    const { data, error } = await supabase.rpc('check_equipment_availability', {
      p_equipment_id: id,
      p_start_date: start_date,
      p_end_date: end_date,
      p_exclude_order_id: exclude_order_id ?? null,
    })
    results[id] = error ? false : (data as boolean)
  }

  return NextResponse.json(results)
}
