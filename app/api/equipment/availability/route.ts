import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { equipment_ids } = await req.json()

  if (!equipment_ids?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results = Object.fromEntries(
    Array.from(new Set(equipment_ids as string[])).map(id => [id, { available: true }]),
  )

  return NextResponse.json({ results })
}
