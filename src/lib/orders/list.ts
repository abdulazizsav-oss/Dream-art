import { computeActiveOrderTotal, type ActiveItemInput } from '../billing'
import { kitPerShift, sanitizeKitSelection } from '../kit'
import {
  applicableRentalEndDate,
  isRentalOverdue,
  resolveRentalEndDate,
  type RentalOverdueInput,
} from '../order-overdue'
import { clientMatchesSearch } from '../client-duplicates'

export type OrderStatus = 'draft' | 'active' | 'returned' | 'overdue' | 'cancelled'
export type QueueFilter = 'active' | 'overdue' | 'debt' | 'missing' | 'returned' | 'all'

interface CloseItem {
  id: string
  name: string
  selected_kit_items: string[]
  current_subtotal: number
  currency: 'UZS' | 'USD'
}

export interface OrderListItem {
  id: string
  orderNumber: string
  status: OrderStatus
  isOverdue: boolean
  clientName: string
  clientPhone: string | null
  startDate: string
  endDate: string | null
  createdAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  createdBy: string | null
  deliveryToClient: boolean
  deliveryFromClient: boolean
  equipmentNames: string[]
  effectiveTotal: number
  paidRental: number
  debt: number
  deliveryFee: number
  deliveryPaid: number
  missingKitItems: string[]
  overdueEquipmentNames: string[]
  missingKitDetails: { order_item_id: string; equipment_name: string; missing_kit_items: string[] }[]
  closeItems: CloseItem[]
}


export function matchesQueue(order: OrderListItem, queue: QueueFilter) {
  if (queue === 'active') return ['active', 'overdue'].includes(order.status)
  if (queue === 'overdue') return order.isOverdue
  if (queue === 'debt') return order.debt > 0.01 && order.status !== 'cancelled'
  if (queue === 'missing') return !['draft', 'cancelled'].includes(order.status)
    && (order.missingKitItems.length > 0 || order.isOverdue)
  if (queue === 'returned') return order.status === 'returned'
  return true
}

export function matchesOrderSearch(order: OrderListItem, query: string) {
  const term = query.trim()
  if (!term) return true
  return [
    order.orderNumber, order.createdBy, ...order.equipmentNames, ...order.missingKitItems,
  ].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(term.toLocaleLowerCase('ru'))
    || clientMatchesSearch({ id: order.id, full_name: order.clientName, phone: order.clientPhone }, term)
}

export function normalizeOrder(order: any, deliveryPaid: number, now: Date): OrderListItem {
  const isActive = order.status === 'active' || order.status === 'overdue'
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
        manual_subtotal: item.manual_subtotal ?? null,
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
      now,
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
  // Missing kit can be reported by a partial return while the rental remains open.
  const missingKitDetails = order.status === 'cancelled' || order.status === 'draft' ? [] : (order.order_items ?? [])
    .filter((item: any) => (item.missing_kit_items?.length ?? 0) > 0)
    .map((item: any) => ({
      order_item_id: item.id as string,
      equipment_name: item.equipment?.name ?? 'Техника',
      missing_kit_items: item.missing_kit_items as string[],
    }))
  const missingKitItems = Array.from(new Set<string>(
    missingKitDetails.flatMap((item: { missing_kit_items: string[] }) => item.missing_kit_items),
  ))
  const overdueEquipmentNames = (order.order_items ?? [])
    .filter((_: any, index: number) => isRentalOverdue(overdueInputs[index]))
    .map((item: any) => item.equipment?.name ?? 'Техника')


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
    missingKitDetails,
    overdueEquipmentNames,
    closeItems,
  }
}
