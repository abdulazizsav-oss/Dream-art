/**
 * Compatibility shim — вся логика биллинга теперь в `@/lib/billing`.
 * Этот файл оставлен только для обратной совместимости с существующими импортами.
 *
 * Новый код должен импортировать `computeOrderBilling` напрямую из `@/lib/billing`.
 */

import type { Equipment } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { kitPerShift, kitSelectionToNames } from './kit'
import {
  buildTashkentDate,
  computeOrderBilling,
  computeShifts,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  getDominantShiftType,
  type BillingItemInput,
  type ShiftBreakdown,
  type ShiftType,
} from './billing'

export {
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
  describeBreakdown,
  describeShift,
  describeUnits,
  getEquipmentRate,
  getPricingParts,
  supportsNightShift,
} from './billing'

export type { ShiftType, RateSource, ShiftCapability } from './billing'

/* ──────── Backward-compatible helpers ──────── */

export interface BillingBreakdown {
  dayUnits: number
  nightUnits: number
  totalUnits: number
}

function toBreakdown(shift: ShiftBreakdown): BillingBreakdown {
  return {
    dayUnits: shift.day_units,
    nightUnits: shift.night_units,
    totalUnits: shift.total_units,
  }
}

function resolveRange(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
): { start: Date; end: Date } | null {
  if (!startDate || !endDate) return null
  return {
    start: buildTashkentDate(startDate, startTime || DEFAULT_START_TIME),
    end: buildTashkentDate(endDate, endTime || DEFAULT_END_TIME),
  }
}

export function getAutoBillingBreakdown(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
): BillingBreakdown {
  const range = resolveRange(startDate, endDate, startTime, endTime)
  if (!range) return { dayUnits: 1, nightUnits: 0, totalUnits: 1 }
  return toBreakdown(computeShifts(range.start, range.end))
}

export function getAutoShiftType(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
): ShiftType {
  const range = resolveRange(startDate, endDate, startTime, endTime)
  if (!range) return 'day'
  return getDominantShiftType(computeShifts(range.start, range.end))
}

/**
 * Пересчёт всех позиций заказа через единую функцию `computeOrderBilling`.
 * Используется в preview-форме и legacy-потребителях.
 */
export function recalculateOrderItems(
  items: OrderItemFormValue[],
  equipment: Pick<Equipment, 'id' | 'day_rate' | 'night_rate' | 'daily_rate' | 'day_night'>[],
  orderContext: {
    start_date?: string | null
    end_date?: string | null
    start_time?: string | null
    end_time?: string | null
  },
): OrderItemFormValue[] {
  const range = resolveRange(
    orderContext.start_date,
    orderContext.end_date,
    orderContext.start_time,
    orderContext.end_time,
  )
  if (!range) return items

  const billingItems: BillingItemInput[] = items.map(item => {
    const eq = equipment.find(c => c.id === item.equipment_id)
    const dayRate = eq?.day_rate ?? eq?.daily_rate ?? item.day_rate_snapshot ?? item.daily_rate ?? 0
    const nightRate = eq?.night_rate ?? dayRate
    const override = item.rate_source === 'manual' ? (item.shift_type ?? null) : null

    return {
      equipment_id: item.equipment_id,
      day_rate: dayRate,
      night_rate: nightRate,
      day_night: eq?.day_night ?? null,
      override,
      kit_per_shift: kitPerShift(item.kit_selection),
    }
  })

  const result = computeOrderBilling({ start: range.start, end: range.end, items: billingItems })

  return items.map((item, idx) => {
    const billed = result.items[idx]
    if (!billed) return item

    // Ручная цена замораживает итог позиции — авто-расчёт по сменам не применяется.
    const manual = item.manual_subtotal != null

    return {
      ...item,
      shift_type: billed.shift_type,
      daily_rate: billed.shift_type === 'night' ? billed.night_rate : billed.day_rate,
      day_rate_snapshot: billed.day_rate,
      night_rate_snapshot: billed.night_rate,
      day_units: billed.day_units,
      night_units: billed.night_units,
      days: billed.day_units + billed.night_units,
      // subtotal billed уже включает доплату за комплект (kit_per_shift × смены).
      subtotal: manual ? item.manual_subtotal! : billed.subtotal,
      rate_source: item.rate_source ?? 'auto',
      // selected_kit_items выводим из kit_selection (источник истины) для трекинга.
      selected_kit_items: item.kit_selection !== undefined
        ? kitSelectionToNames(item.kit_selection)
        : item.selected_kit_items,
    }
  })
}
