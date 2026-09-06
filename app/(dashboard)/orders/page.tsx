import { createClient } from '@/lib/supabase/server'
import { OrdersExplorer } from '@/components/orders/OrdersExplorer'
import { normalizeOrder } from '@/lib/orders/list'

export default async function OrdersPage() {
  const supabase = await createClient()
  const rawOrders: any[] = []
  // Read all pages: old debts and unreturned kits must not disappear after 500 orders.
  const batchSize = 500
  for (let offset = 0; ; offset += batchSize) {
    const { data: orders, error } = await supabase
    .from('orders')
    .select(
      '*, clients(full_name, phone), created_by_profile:user_profiles!orders_created_by_profile_fk(full_name), payments(amount, payment_type), order_items(id, equipment_id, rate_source, manual_subtotal, subtotal, daily_rate, day_rate_snapshot, night_rate_snapshot, day_units, night_units, days, shift_type, kit_selection, actual_start_at, actual_end_at, final_subtotal, final_day_units, final_night_units, returned, selected_kit_items, missing_kit_items, equipment(name, currency, day_rate, night_rate, daily_rate, day_night))',
    )
    .order('created_at', { ascending: false })
    .order('id')
    .range(offset, offset + batchSize - 1)
    if (error) throw new Error(`Не удалось загрузить заказы: ${error.message}`)
    rawOrders.push(...(orders ?? []))
    if ((orders?.length ?? 0) < batchSize) break
  }
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
      totalCount={normalizedOrders.length}
    />
  )
}
