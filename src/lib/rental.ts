import type { Equipment } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'

export type ShiftType = 'day' | 'night'
export type RateSource = 'auto' | 'manual'

export const DEFAULT_START_TIME = '09:30'
export const DEFAULT_END_TIME = '23:00'
export const NIGHT_SHIFT_START = '21:00'
export const NIGHT_SHIFT_END = '10:30'

export interface BillingBreakdown {
  dayUnits: number
  nightUnits: number
  totalUnits: number
}

export interface PricingPart {
  shiftType: ShiftType
  units: number
  rate: number
}

export interface PricingInput {
  daily_rate?: number | null
  day_rate_snapshot?: number | null
  night_rate_snapshot?: number | null
  day_units?: number | null
  night_units?: number | null
  days?: number | null
  shift_type?: ShiftType | null
}

function toTimeMinutes(value?: string | null) {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function diffCalendarDays(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return 0
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

export function isNightShiftWindow(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
) {
  const calendarDiff = diffCalendarDays(startDate, endDate)
  const startMinutes = toTimeMinutes(startTime)
  const endMinutes = toTimeMinutes(endTime)

  if (calendarDiff !== 1 || startMinutes === null || endMinutes === null) return false

  return startMinutes >= (toTimeMinutes(NIGHT_SHIFT_START) ?? 0)
    && endMinutes <= (toTimeMinutes(NIGHT_SHIFT_END) ?? 24 * 60)
}

export function getAutoShiftType(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
): ShiftType {
  return isNightShiftWindow(startDate, endDate, startTime, endTime) ? 'night' : 'day'
}

export function getAutoBillingBreakdown(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
) : BillingBreakdown {
  if (isNightShiftWindow(startDate, endDate, startTime, endTime)) {
    return { dayUnits: 0, nightUnits: 1, totalUnits: 1 }
  }

  if (!startDate || !endDate) {
    return { dayUnits: 1, nightUnits: 0, totalUnits: 1 }
  }

  const calendarSpan = diffCalendarDays(startDate, endDate)

  if (calendarSpan <= 0) {
    return { dayUnits: 1, nightUnits: 0, totalUnits: 1 }
  }

  const dayUnits = Math.max(1, calendarSpan)
  const nightUnits = Math.max(0, calendarSpan - 1)

  return {
    dayUnits,
    nightUnits,
    totalUnits: dayUnits + nightUnits,
  }
}

export function getBillingBreakdown(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
  rateSource: RateSource = 'auto',
  shiftType?: ShiftType,
): BillingBreakdown {
  const auto = getAutoBillingBreakdown(startDate, endDate, startTime, endTime)

  if (rateSource !== 'manual' || !shiftType) return auto

  if (shiftType === 'night') {
    return { dayUnits: 0, nightUnits: auto.totalUnits, totalUnits: auto.totalUnits }
  }

  return { dayUnits: auto.totalUnits, nightUnits: 0, totalUnits: auto.totalUnits }
}

export function getEquipmentRate(
  equipment: Pick<Equipment, 'day_rate' | 'night_rate' | 'daily_rate'>,
  shiftType: ShiftType,
) {
  if (shiftType === 'night') {
    return equipment.night_rate ?? equipment.day_rate ?? equipment.daily_rate
  }
  return equipment.day_rate ?? equipment.daily_rate
}

export function describeShift(shiftType: ShiftType) {
  return shiftType === 'night' ? 'Ночная смена' : 'Дневная смена'
}

export function describeUnits(count: number, shiftType: ShiftType) {
  if (shiftType === 'night') {
    return `${count} ${count === 1 ? 'ночь' : count < 5 ? 'ночи' : 'ночей'}`
  }

  return `${count} ${count === 1 ? 'день' : count < 5 ? 'дня' : 'дней'}`
}

export function describeBreakdown(dayUnits: number, nightUnits: number) {
  const parts: string[] = []

  if (dayUnits > 0) {
    parts.push(`${dayUnits} ${dayUnits === 1 ? 'день' : dayUnits < 5 ? 'дня' : 'дней'}`)
  }

  if (nightUnits > 0) {
    parts.push(`${nightUnits} ${nightUnits === 1 ? 'ночь' : nightUnits < 5 ? 'ночи' : 'ночей'}`)
  }

  return parts.join(' + ') || '1 день'
}

export function getItemBreakdown(
  item: PricingInput,
): BillingBreakdown {
  const fallbackDays = Math.max(1, item.days ?? 1)
  const explicitDayUnits = item.day_units ?? null
  const explicitNightUnits = item.night_units ?? null

  const dayUnits = explicitDayUnits ?? (item.shift_type === 'day' ? fallbackDays : 0)
  const nightUnits = explicitNightUnits ?? (item.shift_type === 'night' ? fallbackDays : 0)
  const totalUnits = dayUnits + nightUnits

  if (totalUnits > 0) {
    return { dayUnits, nightUnits, totalUnits }
  }

  return item.shift_type === 'night'
    ? { dayUnits: 0, nightUnits: fallbackDays, totalUnits: fallbackDays }
    : { dayUnits: fallbackDays, nightUnits: 0, totalUnits: fallbackDays }
}

export function getPricingParts(
  item: PricingInput,
): PricingPart[] {
  const breakdown = getItemBreakdown(item)
  const dayRate = item.day_rate_snapshot ?? item.daily_rate ?? 0
  const nightRate = item.night_rate_snapshot ?? item.day_rate_snapshot ?? item.daily_rate ?? 0
  const parts: PricingPart[] = []

  if (breakdown.dayUnits > 0) {
    parts.push({
      shiftType: 'day',
      units: breakdown.dayUnits,
      rate: dayRate,
    })
  }

  if (breakdown.nightUnits > 0) {
    parts.push({
      shiftType: 'night',
      units: breakdown.nightUnits,
      rate: nightRate,
    })
  }

  return parts
}

export function getItemShiftType(
  item: Pick<OrderItemFormValue, 'shift_type' | 'rate_source'>,
  orderContext: {
    start_date?: string | null
    end_date?: string | null
    start_time?: string | null
    end_time?: string | null
  },
): ShiftType {
  if (item.rate_source === 'manual' && item.shift_type) return item.shift_type
  return getAutoShiftType(
    orderContext.start_date,
    orderContext.end_date,
    orderContext.start_time,
    orderContext.end_time,
  )
}

export function recalculateOrderItems(
  items: OrderItemFormValue[],
  equipment: Pick<Equipment, 'id' | 'day_rate' | 'night_rate' | 'daily_rate'>[],
  orderContext: {
    start_date?: string | null
    end_date?: string | null
    start_time?: string | null
    end_time?: string | null
  },
) {
  return items.map(item => {
    const eq = equipment.find(candidate => candidate.id === item.equipment_id)
    if (!eq) return item

    const shiftType = getItemShiftType(item, orderContext)
    const dayRate = eq.day_rate ?? eq.daily_rate
    const nightRate = eq.night_rate ?? eq.day_rate ?? eq.daily_rate
    const breakdown = getBillingBreakdown(
      orderContext.start_date,
      orderContext.end_date,
      orderContext.start_time,
      orderContext.end_time,
      item.rate_source ?? 'auto',
      shiftType,
    )
    const effectiveRate = getEquipmentRate(eq, shiftType)

    return {
      ...item,
      shift_type: shiftType,
      daily_rate: effectiveRate,
      day_rate_snapshot: dayRate,
      night_rate_snapshot: nightRate,
      day_units: breakdown.dayUnits,
      night_units: breakdown.nightUnits,
      days: breakdown.totalUnits,
      subtotal: dayRate * breakdown.dayUnits + nightRate * breakdown.nightUnits,
      rate_source: item.rate_source ?? 'auto',
    }
  })
}
