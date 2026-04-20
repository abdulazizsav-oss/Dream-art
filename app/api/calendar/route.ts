import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? new Date().toISOString().split('T')[0]
  const to = searchParams.get('to') ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      start_date,
      end_date,
      start_time,
      end_time,
      status,
      created_at,
      created_by_profile:user_profiles!orders_created_by_profile_fk(full_name),
      clients(full_name, phone),
      order_items(
        id,
        equipment_id,
        shift_type,
        daily_rate,
        equipment(name)
      )
    `)
    .lte('start_date', to)
    .gte('end_date', from)
    .not('status', 'in', '(returned,cancelled)')
    .order('start_date')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orders = (data ?? []).map(order => {
    const items = (order.order_items ?? []) as {
      id: string
      equipment_id: string
      shift_type: 'day' | 'night'
      daily_rate: number
      equipment: { name: string } | null
    }[]

    return {
      id: order.id,
      order_number: order.order_number,
      start_date: order.start_date,
      end_date: order.end_date,
      start_time: (order as any).start_time ?? '09:30',
      end_time: (order as any).end_time ?? '23:00',
      status: order.status,
      created_at: (order as any).created_at ?? null,
      client: order.clients,
      created_by_name: ((order as any).created_by_profile as { full_name?: string } | null)?.full_name ?? null,
      items: items.map(item => ({
        id: item.id,
        equipment_id: item.equipment_id,
        name: item.equipment?.name ?? 'Техника',
        shift_type: item.shift_type ?? 'day',
        daily_rate: item.daily_rate,
      })),
    }
  })

  return NextResponse.json({ orders })
}
