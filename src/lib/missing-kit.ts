import { getTashkentDate } from './utils'

export interface MissingKitEventRow {
  id: string
  order_id: string
  order_item_id: string
  kit_name: string
  missing_since: string
  returned_at?: string | null
  orders?: {
    id: string
    order_number: string
    client_id: string
    status?: string | null
    created_at?: string | null
  } | null
  order_items?: {
    id: string
    equipment?: { name?: string | null } | null
  } | null
}

export interface LegacyMissingKitOrderRow {
  id: string
  order_number: string
  client_id: string
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  actual_end_at?: string | null
  actual_return_date?: string | null
  order_items?: LegacyMissingKitOrderItemRow[] | null
}

export interface LegacyMissingKitOrderItemRow {
  id: string
  actual_end_at?: string | null
  missing_kit_items?: string[] | null
  equipment?: { name?: string | null } | null
}

export interface MissingKitElementSummary {
  kit_name: string
  missing_since: string
  age_days: number
}

export interface MissingKitItemSummary {
  order_item_id: string
  equipment_name: string
  missing_kit_items: string[]
  missing: MissingKitElementSummary[]
}

export interface MissingKitOrderSummary {
  orderId: string
  orderNumber: string
  status: string | null
  createdAt: string | null
  items: MissingKitItemSummary[]
}

export interface ClientMissingKitSummary {
  clientId: string
  total: number
  names: string[]
  orders: MissingKitOrderSummary[]
}

function dateNumber(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / 86400000
}

export function calendarDaysSince(missingSince: string, now = new Date()) {
  const start = getTashkentDate(new Date(missingSince))
  const end = getTashkentDate(now)
  return Math.max(0, Math.floor(dateNumber(end) - dateNumber(start)))
}

export function formatMissingKitAge(missingSince: string, now = new Date()) {
  const days = calendarDaysSince(missingSince, now)
  if (days === 0) return 'сегодня'
  if (days === 1) return '1 день'
  if (days < 5) return `${days} дня`
  return `${days} дней`
}

export function formatMissingSinceDateTime(missingSince: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(missingSince))
}

function timestampFromReturnDate(date: string | null | undefined) {
  return date ? new Date(`${date}T00:00:00+05:00`).toISOString() : null
}

export function buildLegacyMissingKitEvents(orders: LegacyMissingKitOrderRow[]) {
  const events: MissingKitEventRow[] = []

  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      const missingSince =
        item.actual_end_at ??
        order.actual_end_at ??
        timestampFromReturnDate(order.actual_return_date) ??
        order.updated_at ??
        order.created_at ??
        new Date().toISOString()

      for (const kitName of item.missing_kit_items ?? []) {
        if (!kitName.trim()) continue
        events.push({
          id: `legacy:${item.id}:${kitName}`,
          order_id: order.id,
          order_item_id: item.id,
          kit_name: kitName,
          missing_since: missingSince,
          returned_at: null,
          orders: {
            id: order.id,
            order_number: order.order_number,
            client_id: order.client_id,
            status: order.status ?? null,
            created_at: order.created_at ?? null,
          },
          order_items: {
            id: item.id,
            equipment: item.equipment ?? null,
          },
        })
      }
    }
  }

  return events
}

export function mergeMissingKitEvents(primary: MissingKitEventRow[], fallback: MissingKitEventRow[]) {
  const seen = new Set(primary.map(event => `${event.order_item_id}:${event.kit_name}`))
  return [
    ...primary,
    ...fallback.filter(event => {
      const key = `${event.order_item_id}:${event.kit_name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  ]
}

export function buildMissingKitByClient(events: MissingKitEventRow[], now = new Date()) {
  const byClient = new Map<string, ClientMissingKitSummary>()

  for (const event of events) {
    if (event.returned_at) continue
    const order = event.orders
    if (!order?.client_id) continue

    const current = byClient.get(order.client_id) ?? {
      clientId: order.client_id,
      total: 0,
      names: [],
      orders: [],
    }

    let orderSummary = current.orders.find(summary => summary.orderId === order.id)
    if (!orderSummary) {
      orderSummary = {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status ?? null,
        createdAt: order.created_at ?? null,
        items: [],
      }
      current.orders.push(orderSummary)
    }

    const orderItemId = event.order_item_id
    let itemSummary = orderSummary.items.find(item => item.order_item_id === orderItemId)
    if (!itemSummary) {
      itemSummary = {
        order_item_id: orderItemId,
        equipment_name: event.order_items?.equipment?.name ?? '—',
        missing_kit_items: [],
        missing: [],
      }
      orderSummary.items.push(itemSummary)
    }

    itemSummary.missing_kit_items.push(event.kit_name)
    itemSummary.missing.push({
      kit_name: event.kit_name,
      missing_since: event.missing_since,
      age_days: calendarDaysSince(event.missing_since, now),
    })
    current.total += 1
    current.names.push(event.kit_name)

    byClient.set(order.client_id, current)
  }

  return byClient
}

export function formatMissingKitPreview(names: string[], limit = 5) {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)

  const parts = Array.from(counts.entries()).map(([name, count]) =>
    count > 1 ? `${name} x${count}` : name,
  )
  const visible = parts.slice(0, limit)
  const hidden = parts.length - visible.length

  return hidden > 0 ? `${visible.join(', ')} +${hidden}` : visible.join(', ')
}
