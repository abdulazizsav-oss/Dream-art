import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const [
    { data: stats },
    { data: topEquipment },
    { data: topClients },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('v_dashboard_stats').select('*').single(),
    supabase
      .from('v_equipment_utilization')
      .select('id, name, total_revenue, total_rental_days, roi_percent')
      .order('total_revenue', { ascending: false })
      .limit(5),
    supabase
      .from('clients')
      .select('id, full_name, orders(total_amount, status)')
      .limit(100),
    supabase
      .from('orders')
      .select('id, order_number, status, total_amount, start_date, end_date, clients(full_name)')
      .in('status', ['active', 'overdue'])
      .order('end_date')
      .limit(10),
  ])

  // Compute top clients from joined data
  const clientRevenue = (topClients ?? []).map(c => ({
    id: c.id,
    full_name: c.full_name,
    total_revenue: ((c.orders as { total_amount: number; status: string }[]) ?? [])
      .filter(o => o.status !== 'cancelled')
      .reduce((s, o) => s + o.total_amount, 0),
    total_orders: ((c.orders as { status: string }[]) ?? []).length,
  }))
  .sort((a, b) => b.total_revenue - a.total_revenue)
  .slice(0, 5)

  return NextResponse.json({
    stats,
    topEquipment,
    topClients: clientRevenue,
    recentOrders,
  })
}
