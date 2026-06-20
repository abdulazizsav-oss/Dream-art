import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildCalendarWindow,
  calendarRangeDays,
  chooseNearestCalendarAnchor,
  findCalendarConflicts,
} from '@/lib/calendar-range'
import { getTashkentDate } from '@/lib/utils'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const VALID_STATUSES = new Set(['active', 'overdue', 'draft', 'returned', 'cancelled', 'all'])
const MAX_DAYS = 62

function isValidDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

type RawOrder = {
  id: string
  order_number: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: string
  created_at: string | null
  created_by: string | null
  created_by_profile: { full_name?: string } | null
  clients: { full_name?: string; phone?: string | null } | null
  order_items: {
    id: string
    equipment_id: string
    shift_type: string
    daily_rate: number
    equipment: {
      id?: string
      name?: string
      category_id?: string | null
      currency?: string
    } | null
  }[]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const today = getTashkentDate()
  let from = searchParams.get('from') ?? addDays(today, -2)
  let to = searchParams.get('to') ?? addDays(from, 13)
  const requestedView = searchParams.get('view') ?? 'orders'
  const status = searchParams.get('status') ?? 'active'
  const equipmentId = searchParams.get('equipment_id')
  const categoryId = searchParams.get('category_id')
  const adminId = searchParams.get('admin_id')
  const nearest = searchParams.get('nearest') === 'true'

  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    return NextResponse.json({ error: 'Некорректный период' }, { status: 400 })
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 })
  }
  if (!['orders', 'equipment'].includes(requestedView)) {
    return NextResponse.json({ error: 'Некорректный режим календаря' }, { status: 400 })
  }

  let requestedDays = calendarRangeDays(from, to)
  if (requestedDays < 1 || requestedDays > MAX_DAYS) {
    return NextResponse.json(
      { error: `Период календаря должен быть от 1 до ${MAX_DAYS} дней` },
      { status: 400 },
    )
  }

  const supabase = await createClient()

  async function fetchOrders(rangeFrom: string, rangeTo: string) {
    return supabase
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
        created_by,
        created_by_profile:user_profiles!orders_created_by_profile_fk(full_name),
        clients(full_name, phone),
        order_items(
          id,
          equipment_id,
          shift_type,
          daily_rate,
          equipment(id, name, category_id, currency)
        )
      `)
      .lte('start_date', rangeTo)
      .gte('end_date', rangeFrom)
      .order('start_date')
      .order('created_at')
  }

  let shifted = false
  let anchorDate: string | null = null
  let { data: rawOrders, error: ordersError } = await fetchOrders(from, to)

  if (!ordersError && nearest && (rawOrders?.length ?? 0) === 0) {
    const { data: candidates, error: candidatesError } = await supabase
      .from('orders')
      .select('id, start_date, end_date, status')
      .order('start_date', { ascending: false })

    if (candidatesError) {
      ordersError = candidatesError
    } else {
      const anchor = chooseNearestCalendarAnchor(candidates ?? [], from)
      if (anchor) {
        const nextWindow = buildCalendarWindow(anchor.start_date, requestedDays)
        from = nextWindow.from
        to = nextWindow.to
        shifted = true
        anchorDate = anchor.start_date
        const shiftedResult = await fetchOrders(from, to)
        rawOrders = shiftedResult.data
        ordersError = shiftedResult.error
      }
    }
  }

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 })
  }

  const [
    { data: equipment, error: equipmentError },
    { data: categories, error: categoriesError },
    { data: admins, error: adminsError },
    { data: blockedDates, error: blockedError },
    { data: maintenance, error: maintenanceError },
  ] = await Promise.all([
    supabase
      .from('equipment')
      .select('id, name, category_id, status, currency, equipment_categories(name)')
      .order('name'),
    supabase
      .from('equipment_categories')
      .select('id, name')
      .order('name'),
    supabase
      .from('user_profiles')
      .select('id, full_name, role')
      .order('full_name'),
    supabase
      .from('blocked_dates')
      .select('id, equipment_id, start_date, end_date, reason, equipment(name)')
      .lte('start_date', to)
      .gte('end_date', from),
    supabase
      .from('equipment_maintenance')
      .select('id, equipment_id, scheduled_date, completed_date, description, cost, equipment(name)')
      .lte('scheduled_date', to)
      .or(`completed_date.gte.${from},completed_date.is.null`),
  ])

  const metadataError = equipmentError ?? categoriesError ?? adminsError ?? blockedError ?? maintenanceError
  if (metadataError) {
    return NextResponse.json({ error: metadataError.message }, { status: 500 })
  }

  const orders = ((rawOrders ?? []) as unknown as RawOrder[])
    .map(order => ({
      id: order.id,
      order_number: order.order_number,
      start_date: order.start_date,
      end_date: order.end_date,
      start_time: order.start_time || '09:30',
      end_time: order.end_time || '23:00',
      status: order.status,
      created_at: order.created_at,
      created_by: order.created_by,
      created_by_name: order.created_by_profile?.full_name ?? null,
      client: order.clients
        ? {
            full_name: order.clients.full_name ?? 'Клиент',
            phone: order.clients.phone ?? null,
          }
        : null,
      items: (order.order_items ?? []).map(item => ({
        id: item.id,
        equipment_id: item.equipment_id,
        name: item.equipment?.name ?? 'Техника',
        category_id: item.equipment?.category_id ?? null,
        currency: item.equipment?.currency ?? 'UZS',
        shift_type: item.shift_type,
        daily_rate: item.daily_rate,
      })),
    }))
    .filter(order => {
      if (status === 'active' && !['active', 'overdue'].includes(order.status)) return false
      if (status !== 'active' && status !== 'all' && order.status !== status) return false
      if (adminId && order.created_by !== adminId) return false
      if (equipmentId && !order.items.some(item => item.equipment_id === equipmentId)) return false
      if (categoryId && !order.items.some(item => item.category_id === categoryId)) return false
      return true
    })

  const activeSegments = orders.flatMap(order => (
    ['active', 'overdue', 'draft'].includes(order.status)
      ? order.items.map(item => ({
          key: `${order.id}:${item.id}`,
          orderId: order.id,
          equipmentId: item.equipment_id,
          from: order.start_date,
          to: order.end_date,
        }))
      : []
  ))

  const conflicts = findCalendarConflicts(activeSegments)

  const allocations = orders.flatMap(order => (
    order.items.map(item => {
      const key = `${order.id}:${item.id}`
      return {
        id: key,
        order_id: order.id,
        order_number: order.order_number,
        equipment_id: item.equipment_id,
        equipment_name: item.name,
        start_date: order.start_date,
        end_date: order.end_date,
        start_time: order.start_time,
        end_time: order.end_time,
        status: order.status,
        shift_type: item.shift_type,
        client_name: order.client?.full_name ?? 'Клиент',
        client_phone: order.client?.phone ?? null,
        created_by_name: order.created_by_name,
        conflict_order_ids: conflicts[key] ?? [],
      }
    })
  ))

  requestedDays = calendarRangeDays(from, to)

  return NextResponse.json({
    orders,
    allocations,
    blocked: (blockedDates ?? []).map(row => ({
      id: row.id,
      equipment_id: row.equipment_id,
      equipment_name: (row.equipment as { name?: string } | null)?.name ?? 'Техника',
      start_date: row.start_date,
      end_date: row.end_date,
      label: row.reason || 'Заблокировано',
      type: 'blocked',
    })),
    maintenance: (maintenance ?? []).map(row => ({
      id: row.id,
      equipment_id: row.equipment_id,
      equipment_name: (row.equipment as { name?: string } | null)?.name ?? 'Техника',
      start_date: row.scheduled_date,
      end_date: row.completed_date || row.scheduled_date,
      label: row.description || 'Техническое обслуживание',
      cost: row.cost,
      type: 'maintenance',
    })),
    filters: {
      equipment: equipment ?? [],
      categories: categories ?? [],
      admins: admins ?? [],
    },
    range: {
      from,
      to,
      days: requestedDays,
      shifted,
      anchor_date: anchorDate,
      timezone: 'Asia/Tashkent',
    },
  })
}
