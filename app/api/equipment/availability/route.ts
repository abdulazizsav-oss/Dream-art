import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

type AvailabilityResult = {
  available: boolean
  equipment_name?: string
  order_number?: string
  message?: string
}

function rangeStart(date: string, time: string) {
  return new Date(`${date}T${time.slice(0, 5)}:00+05:00`).getTime()
}

async function findConflict(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  equipmentId: string,
  requestedStart: number,
  requestedEnd: number,
  excludeOrderId?: string | null,
): Promise<Omit<AvailabilityResult, 'available'> | null> {
  const { data } = await service
    .from('order_items')
    .select('equipment(name), orders!inner(id, order_number, status, start_date, end_date, start_time, end_time)')
    .eq('equipment_id', equipmentId)
    .eq('returned', false)

  const rows = (data ?? []) as unknown as Array<{
    equipment: { name: string | null } | null
    orders: {
      id: string
      order_number: string
      status: string
      start_date: string
      end_date: string
      start_time: string | null
      end_time: string | null
    } | null
  }>

  const conflict = rows.find(row => {
    const order = row.orders
    if (!order || order.id === excludeOrderId || ['returned', 'cancelled'].includes(order.status)) return false
    const orderStart = rangeStart(order.start_date, order.start_time ?? '00:00')
    const orderEnd = rangeStart(order.end_date, order.end_time ?? '23:59')
    return orderStart < requestedEnd && orderEnd > requestedStart
  })

  if (!conflict?.orders) return null
  const equipmentName = conflict.equipment?.name ?? 'Техника'
  return {
    equipment_name: equipmentName,
    order_number: conflict.orders.order_number,
    message: `«${equipmentName}» занят в выбранный период (уже в заказе ${conflict.orders.order_number})`,
  }
}

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
  const service = await createServiceClient()
  const ids = Array.from(new Set(equipment_ids as string[]))
  const requestedStart = rangeStart(start_date, start_time)
  const requestedEnd = rangeStart(end_date, end_time)

  const entries = await Promise.all(
    ids.map(async id => {
      const { data, error } = await service.rpc('check_equipment_availability_tr', {
        p_equipment_id: id,
        p_start_date: start_date,
        p_start_time: start_time,
        p_end_date: end_date,
        p_end_time: end_time,
        p_exclude_order_id: exclude_order_id ?? null,
      })

      const available = !error && Boolean(data)
      if (available) return [id, { available }] as const

      const conflict = await findConflict(service, id, requestedStart, requestedEnd, exclude_order_id ?? null)
      return [id, {
        available: false,
        ...(conflict ?? { message: 'Техника недоступна на выбранные даты' }),
      }] as const
    }),
  )

  const results = Object.fromEntries(entries)

  return NextResponse.json({ results })
}
