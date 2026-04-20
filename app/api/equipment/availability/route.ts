import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { equipment_ids, start_date, end_date, exclude_order_id } = await req.json()

  if (!equipment_ids?.length || !start_date || !end_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  void exclude_order_id

  const results = Object.fromEntries(
    (equipment_ids as string[]).map(id => [id, true]),
  )

  return NextResponse.json(results)
}
