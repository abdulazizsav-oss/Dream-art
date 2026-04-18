import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? new Date().toISOString().split('T')[0]
  const to = searchParams.get('to') ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const supabase = await createClient()

  const [ordersResult, blockedResult, equipmentResult, categoriesResult, profilesResult] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, start_date, end_date, status, created_by, created_at, clients(full_name, phone), order_items(equipment_id, equipment(name, category_id))')
      .lte('start_date', to)
      .gte('end_date', from)
      .not('status', 'in', '(returned,cancelled)'),
    supabase.from('blocked_dates').select('*').lte('start_date', to).gte('end_date', from),
    supabase
      .from('equipment')
      .select('id, name, status, category_id, brand, specs, sort_order, equipment_categories!inner(name, is_active)')
      .eq('equipment_categories.is_active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('equipment_categories')
      .select('id, name, slug, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    supabase.from('user_profiles').select('id, full_name'),
  ])

  let equipment: unknown = equipmentResult.data ?? []
  if (equipmentResult.error) {
    const fallback = await supabase
      .from('equipment')
      .select('id, name, status, category_id, equipment_categories(name)')
      .order('name')
    equipment = fallback.data?.map(item => ({
      ...item,
      brand: null,
      specs: null,
      sort_order: 0,
      equipment_categories: item.equipment_categories
        ? { ...item.equipment_categories, is_active: true }
        : null,
    }))
  }

  let categories: unknown = categoriesResult.data ?? []
  if (categoriesResult.error) {
    const fallback = await supabase
      .from('equipment_categories')
      .select('id, name, slug')
      .order('name')
    categories = fallback.data?.map(item => ({
      ...item,
      sort_order: 0,
      is_active: true,
    }))
  }

  const orders = ordersResult.data
  const blocked = blockedResult.data
  const profiles = profilesResult.data

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name]))
  const bookings = (orders ?? []).flatMap(order => {
    const items = (order.order_items ?? []) as {
      equipment_id: string
      equipment: { name: string; category_id: string | null } | null
    }[]

    return items.map(item => ({
      equipment_id: item.equipment_id,
      equipment_name: item.equipment?.name ?? 'Техника',
      order: {
        id: order.id,
        order_number: order.order_number,
        start_date: order.start_date,
        end_date: order.end_date,
        status: order.status,
        created_by: order.created_by,
        created_at: (order as any).created_at ?? null,
        client: order.clients,
      },
    }))
  })

  return NextResponse.json({ equipment, categories, bookings, blocked, profiles: profileMap })
}
