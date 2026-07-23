export interface ClientAlertOrderItem {
  subtotal: number | null
  final_subtotal: number | null
  returned: boolean | null
  equipment: { name: string | null } | null
}

export interface ClientAlertOrder {
  id: string
  order_number: string
  status: string
  delivery_fee: number | null
  order_items: ClientAlertOrderItem[] | null
  payments: { amount: number | null; payment_type: string | null }[] | null
}

export interface ClientOrderAlertSummary {
  outstanding_total: number
  debt_orders: { id: string; order_number: string; outstanding: number; status: string }[]
  active_equipment: { order_id: string; order_number: string; equipment_names: string[] }[]
  missing_accessories: { total: number; names: string[] }
}

export function getOrderOutstanding(order: ClientAlertOrder) {
  if (order.status === 'cancelled' || order.status === 'draft') return 0

  const charge = (order.order_items ?? []).reduce(
    (sum, item) => sum + Number(item.final_subtotal ?? item.subtotal ?? 0),
    0,
  ) + Number(order.delivery_fee ?? 0)
  const paid = (order.payments ?? [])
    .filter(payment => payment.payment_type === 'rental')
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)

  return Math.max(0, charge - paid)
}

export function buildClientOrderAlertSummary(
  orders: readonly ClientAlertOrder[],
  missingAccessories: { total: number; names: string[] } | null | undefined,
): ClientOrderAlertSummary {
  const debtOrders = orders
    .map(order => ({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      outstanding: getOrderOutstanding(order),
    }))
    .filter(order => order.outstanding > 0.01)

  const activeEquipment = orders
    .filter(order => order.status === 'active' || order.status === 'overdue')
    .map(order => ({
      order_id: order.id,
      order_number: order.order_number,
      equipment_names: (order.order_items ?? [])
        .filter(item => !item.returned)
        .map(item => item.equipment?.name ?? 'Техника'),
    }))
    .filter(order => order.equipment_names.length > 0)

  return {
    outstanding_total: debtOrders.reduce((sum, order) => sum + order.outstanding, 0),
    debt_orders: debtOrders,
    active_equipment: activeEquipment,
    missing_accessories: missingAccessories ?? { total: 0, names: [] },
  }
}

