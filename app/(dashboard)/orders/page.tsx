import { createClient } from '@/lib/supabase/server'
import { computeActiveOrderTotal, type ActiveItemInput } from '@/lib/billing'
import { kitPerShift, sanitizeKitSelection } from '@/lib/kit'
import {
  applicableRentalEndDate,
  isRentalOverdue,
  resolveRentalEndDate,
  type RentalOverdueInput,
} from '@/lib/order-overdue'
import {
  OrdersExplorer,
  type OrderListItem,
} from '@/components/orders/OrdersExplorer'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: orders, count } = await supabase
    .from('orders')
    .select(
      '*, clients(full_name, phone), created_by_profile:user_profiles!orders_created_by_profile_fk(full_name), payments(amount, payment_type), order_items(id, equipment_id, rate_source, subtotal, daily_rate, day_rate_snapshot, night_rate_snapshot, day_units, night_units, days, shift_type, kit_selection, actual_start_at, actual_end_at, final_subtotal, final_day_units, final_night_units, returned, selected_kit_items, missing_kit_items, equipment(name, currency, day_rate, night_rate, daily_rate, day_night))',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .limit(500)

  const rawOrders = (orders ?? []) as any[]
  const deliveryOrderIds = rawOrders
    .filter(order => Number(order.delivery_fee ?? 0) > 0)
    .map(order => order.id as string)
  const deliveryPaidByOrder = new Map<string, number>()

  if (deliveryOrderIds.length > 0) {
    // Отдельный запрос сохраняет совместимость с базой до применения миграции доставки.
    const { data: allocations } = await (supabase as any)
      .from('order_delivery_payment_allocations')
      .select('order_id, amount')
      .in('order_id', deliveryOrderIds)

    for (const allocation of (allocations ?? []) as { order_id: string; amount: number | null }[]) {
      deliveryPaidByOrder.set(
        allocation.order_id,
        (deliveryPaidByOrder.get(allocation.order_id) ?? 0) + Number(allocation.amount ?? 0),
      )
    }
  }

  const now = new Date()
  const normalizedOrders = rawOrders.map(order => normalizeOrder(
    order,
    deliveryPaidByOrder.get(order.id) ?? 0,
    now,
  ))

  return (
    <OrdersExplorer
      orders={normalizedOrders}
      totalCount={count ?? normalizedOrders.length}
    />
  )
}

function normalizeOrder(order: any, deliveryPaid: number, now: Date): OrderListItem {
  const isActive = order.status === 'active' || order.status === 'overdue'
  const isClosed = order.status === 'returned'
  const overdueInputs: RentalOverdueInput[] = (order.order_items ?? []).map((item: any) => ({
    status: order.status,
    endDate: applicableRentalEndDate({
      orderEndDate: order.end_date,
      orderActualStartAt: order.actual_start_at,
      itemActualStartAt: item.actual_start_at,
    }),
    startDate: order.start_date,
    startTime: order.start_time,
    endTime: order.end_time,
    actualStartAt: item.actual_start_at ?? order.actual_start_at,
    actualEndAt: item.actual_end_at,
    actualReturnDate: order.actual_return_date,
    returned: item.returned,
    dayUnits: item.day_units,
    nightUnits: item.night_units,
    days: item.days,
    now,
  }))
  const fallbackOverdueInput: RentalOverdueInput = {
    status: order.status,
    endDate: order.end_date,
    startDate: order.start_date,
    startTime: order.start_time,
    endTime: order.end_time,
    actualStartAt: order.actual_start_at,
    actualEndAt: order.actual_end_at,
    actualReturnDate: order.actual_return_date,
    now,
  }
  const isOverdue = overdueInputs.length > 0
    ? overdueInputs.some(isRentalOverdue)
    : isRentalOverdue(fallbackOverdueInput)
  const resolvedEndDate = overdueInputs
    .map(resolveRentalEndDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
    ?? resolveRentalEndDate(fallbackOverdueInput)
  const deliveryToClient = Boolean(order.delivery_to_client) || order.fulfillment_method === 'delivery'
  const deliveryFromClient = Boolean(order.delivery_from_client)
  const deliveryFee = Math.max(0, Number(order.delivery_fee ?? 0))
  const paidRental = (order.payments ?? [])
    .filter((payment: any) => payment.payment_type === 'rental')
    .reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0)

  let effectiveTotal = Number(order.total_amount ?? 0)
  let itemBillingById = new Map<string, { subtotal: number }>()

  if (isActive && (order.order_items?.length ?? 0) > 0) {
    const inputs: ActiveItemInput[] = (order.order_items ?? []).map((item: any) => {
      const equipment = item.equipment
      const dayRate = equipment?.day_rate
        ?? item.day_rate_snapshot
        ?? equipment?.daily_rate
        ?? item.daily_rate
        ?? 0
      const nightRate = equipment?.night_rate ?? item.night_rate_snapshot ?? null

      return {
        id: item.id,
        equipment_id: item.equipment_id,
        rate_source: item.rate_source ?? null,
        actual_start_at: item.actual_start_at ?? order.actual_start_at ?? null,
        actual_end_at: item.actual_end_at ?? null,
        final_subtotal: item.final_subtotal ?? null,
        final_day_units: item.final_day_units ?? null,
        final_night_units: item.final_night_units ?? null,
        day_rate: dayRate,
        night_rate: nightRate,
        day_night: equipment?.day_night ?? null,
        subtotal: item.subtotal ?? 0,
        day_units: item.day_units ?? 0,
        night_units: item.night_units ?? 0,
        shift_type: item.shift_type ?? 'day',
        kit_per_shift: kitPerShift(sanitizeKitSelection(item.kit_selection)),
      }
    })
    const live = computeActiveOrderTotal({
      now: new Date(),
      items: inputs,
      delivery_fee: deliveryFee,
    })
    effectiveTotal = live.total_amount
    itemBillingById = live.perItem
  }

  const closeItems = (order.order_items ?? [])
    .filter((item: any) => !item.returned)
    .map((item: any) => ({
      id: item.id as string,
      name: item.equipment?.name ?? 'Техника',
      selected_kit_items: item.selected_kit_items ?? [],
      current_subtotal: itemBillingById.get(item.id)?.subtotal ?? Number(item.subtotal ?? 0),
      currency: item.equipment?.currency === 'USD' ? 'USD' as const : 'UZS' as const,
    }))

  const equipmentNames = Array.from(new Set<string>(
    (order.order_items ?? []).map((item: any) => item.equipment?.name ?? 'Техника'),
  ))
  const missingKitItems = isClosed
    ? Array.from(new Set<string>(
        (order.order_items ?? []).flatMap((item: any) => item.missing_kit_items ?? []),
      ))
    : []

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    isOverdue,
    clientName: order.clients?.full_name ?? 'Клиент не указан',
    clientPhone: order.clients?.phone ?? null,
    startDate: order.start_date,
    endDate: resolvedEndDate,
    createdAt: order.created_at ?? null,
    actualStartAt: order.actual_start_at ?? null,
    actualEndAt: order.actual_end_at ?? null,
    createdBy: order.created_by_profile?.full_name ?? null,
    deliveryToClient,
    deliveryFromClient,
    equipmentNames,
    effectiveTotal,
    paidRental,
    debt: Math.max(0, effectiveTotal - paidRental),
    deliveryFee,
    deliveryPaid,
    missingKitItems,
    closeItems,
  }
}
