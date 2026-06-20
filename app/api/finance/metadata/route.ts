import { NextResponse } from 'next/server'
import { getMyProfile } from '@/lib/supabase/getRole'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const profile = await getMyProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const [{ data: orders, error: ordersError }, { data: equipment, error: equipmentError }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, clients(full_name)')
        .in('status', ['active', 'overdue'])
        .order('order_number'),
      supabase
        .from('equipment')
        .select('id, name')
        .eq('currency', 'UZS')
        .order('name'),
    ])

  const error = ordersError ?? equipmentError
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    orders: orders ?? [],
    equipment: equipment ?? [],
    is_super_admin: profile.role === 'super_admin',
  })
}
