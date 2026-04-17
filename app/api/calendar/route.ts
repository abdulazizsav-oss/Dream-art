import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? new Date().toISOString().split('T')[0]
  const to = searchParams.get('to') ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const supabase = await createClient()

  const [{ data: bookings }, { data: blocked }, { data: equipment }, { data: profiles }] = await Promise.all([
    supabase
      .from('order_items')
      .select('equipment_id, orders(id, order_number, start_date, end_date, status, created_by, clients(full_name))')
      .not('orders', 'is', null),
    supabase.from('blocked_dates').select('*').lte('start_date', to).gte('end_date', from),
    supabase.from('equipment').select('id, name, status, equipment_categories(name)').order('name'),
    supabase.from('user_profiles').select('id, full_name'),
  ])

  // Filter to date range
  const filteredBookings = (bookings ?? []).filter(b => {
    const order = b.orders as { start_date: string; end_date: string; status: string } | null
    if (!order) return false
    if (['cancelled', 'returned'].includes(order.status)) return false
    return order.start_date <= to && order.end_date >= from
  })

  // Build a lookup map: user_id → full_name
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name]))

  return NextResponse.json({ equipment, bookings: filteredBookings, blocked, profiles: profileMap })
}
