import { getTashkentDate, getTashkentTime } from '@/lib/utils'

const DEFAULT_ORDER_END_TIME = '23:00'
const FALLBACK_TODAY_END_TIME = '23:59'

export interface AddedItemBillingWindow {
  start_date: string
  start_time: string
  end_date: string
  end_time: string
}

/**
 * Предварительное окно дозаказа. Фактическое начисление всегда начинается с
 * `actual_start_at`, который RPC фиксирует при вставке позиции. Это окно нужно
 * только для корректного preview/первичного subtotal до live-пересчёта.
 */
export function resolveAddedItemBillingWindow(args: {
  now: Date
  orderEndDate: string
  orderEndTime?: string | null
}): AddedItemBillingWindow {
  const startDate = getTashkentDate(args.now)
  const startTime = getTashkentTime(args.now)
  const plannedEndTime = args.orderEndTime?.slice(0, 5) || DEFAULT_ORDER_END_TIME
  const plannedWindowAlreadyEnded = args.orderEndDate < startDate
    || (args.orderEndDate === startDate && plannedEndTime < startTime)

  return {
    start_date: startDate,
    start_time: startTime,
    end_date: plannedWindowAlreadyEnded ? startDate : args.orderEndDate,
    end_time: plannedWindowAlreadyEnded ? FALLBACK_TODAY_END_TIME : plannedEndTime,
  }
}

/** Первоначальные позиции наследуют старт заказа; у дозаказа свой более поздний старт. */
export function isOrderItemAddedLater(args: {
  orderActualStartAt?: string | null
  itemActualStartAt?: string | null
}): boolean {
  if (!args.orderActualStartAt || !args.itemActualStartAt) return false

  const orderStart = new Date(args.orderActualStartAt).getTime()
  const itemStart = new Date(args.itemActualStartAt).getTime()
  if (!Number.isFinite(orderStart) || !Number.isFinite(itemStart)) return false

  return itemStart > orderStart
}
