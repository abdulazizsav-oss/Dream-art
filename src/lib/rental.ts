import type { Equipment } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'

export type ShiftType = 'day' | 'night'
export type RateSource = 'auto' | 'manual'

/* ────────────────────────────────────────────────────
   Константы бизнес-логики
   ──────────────────────────────────────────────────── */
export const DEFAULT_START_TIME = '09:30'
export const DEFAULT_END_TIME = '23:00'

/** Дневная смена: максимум 10 ч 20 мин */
const DAY_SHIFT_MAX_MINUTES = 10 * 60 + 20 // 620

/** Ночная смена начинается в 20:00 */
const NIGHT_START_MINUTES = 20 * 60 // 1200

/** Ночная смена заканчивается в 10:00 */
const NIGHT_END_MINUTES = 10 * 60 // 600

/** Особый случай (взял вечером, без ночной): возврат до 23:00 след. дня */
const EVENING_EXTENDED_END = 23 * 60 // 1380

/* ────────────────────────────────────────────────────
   Типы
   ──────────────────────────────────────────────────── */
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

/* ────────────────────────────────────────────────────
   Утилиты
   ──────────────────────────────────────────────────── */
function toTimeMinutes(value?: string | null): number | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function diffCalendarDays(startDate?: string | null, endDate?: string | null): number {
  if (!startDate || !endDate) return 0
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

/* ────────────────────────────────────────────────────
   Основная логика расчёта смен
   
   📌 Правила:
   1. Дневная смена — до 10 ч 20 м от начала
   2. Переход на следующий день: возврат до 10:00 → 1 дневная
   3. Ночная смена: 20:00–10:00 (если есть ночная ставка)
   4. День + ночь: утро → утро (если возврат после 10:00)
   5. Вечер без ночной: 20:00 → до 23:00 следующего = 1 смена
   6. Просрочка: +1 смена за каждое превышение
   ──────────────────────────────────────────────────── */

/**
 * Определяет, является ли окно аренды чисто ночным
 * Ночная: взял >= 20:00, вернул <= 10:00 следующего дня
 */
export function isNightShiftWindow(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
): boolean {
  const calendarDiff = diffCalendarDays(startDate, endDate)
  const startMin = toTimeMinutes(startTime)
  const endMin = toTimeMinutes(endTime)

  if (startMin === null || endMin === null) return false

  // Только 1 день разницы может быть ночной сменой
  if (calendarDiff !== 1) return false

  return startMin >= NIGHT_START_MINUTES && endMin <= NIGHT_END_MINUTES
}

/**
 * Автоматически определяет тип смены по датам/времени
 */
export function getAutoShiftType(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
): ShiftType {
  return isNightShiftWindow(startDate, endDate, startTime, endTime) ? 'night' : 'day'
}

/**
 * Рассчитывает количество дневных и ночных смен
 * 
 * Правила:
 * - diffDays=0 (тот же день): всегда 1 дневная
 * - diffDays=1 (следующий день):
 *   a) start>=20:00, end<=10:00 → 1 ночная
 *   b) start<20:00, end<=10:00 → 1 дневная (переход ночи без доплаты)
 *   c) start<20:00, end>10:00 → 1 день + 1 ночь
 *   d) start>=20:00, end>10:00 → 1 дневная (вечерний особый случай)
 *      если end>23:00 → 2 дневных
 * - diffDays>=2: считаем пропорционально
 */
export function getAutoBillingBreakdown(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null,
): BillingBreakdown {
  if (!startDate || !endDate) {
    return { dayUnits: 1, nightUnits: 0, totalUnits: 1 }
  }

  const calendarSpan = diffCalendarDays(startDate, endDate)
  const startMin = toTimeMinutes(startTime) ?? toTimeMinutes(DEFAULT_START_TIME)!
  const endMin = toTimeMinutes(endTime) ?? toTimeMinutes(DEFAULT_END_TIME)!

  // ── Тот же день (diffDays = 0) ──
  if (calendarSpan <= 0) {
    // В рамках одного дня — всегда 1 дневная смена
    return { dayUnits: 1, nightUnits: 0, totalUnits: 1 }
  }

  // ── Следующий день (diffDays = 1) ──
  if (calendarSpan === 1) {
    const startedEvening = startMin >= NIGHT_START_MINUTES
    const endBeforeMorning = endMin <= NIGHT_END_MINUTES

    // a) Чисто ночная: взял >= 20:00, вернул <= 10:00
    if (startedEvening && endBeforeMorning) {
      return { dayUnits: 0, nightUnits: 1, totalUnits: 1 }
    }

    // b) Дневная с переходом: взял днём, вернул до 10:00 следующего
    if (!startedEvening && endBeforeMorning) {
      return { dayUnits: 1, nightUnits: 0, totalUnits: 1 }
    }

    // c) День + ночь: взял днём, вернул после 10:00 следующего
    if (!startedEvening && !endBeforeMorning) {
      return { dayUnits: 1, nightUnits: 1, totalUnits: 2 }
    }

    // d) Особый случай: взял вечером (>= 20:00), вернул после 10:00 следующего
    // Если техника без ночной ставки — это 1 дневная до 23:00 следующего
    if (startedEvening && !endBeforeMorning) {
      if (endMin <= EVENING_EXTENDED_END) {
        return { dayUnits: 1, nightUnits: 0, totalUnits: 1 }
      }
      // Превышение 23:00 → 2 дневных
      return { dayUnits: 2, nightUnits: 0, totalUnits: 2 }
    }
  }

  // ── Два дня и более (diffDays >= 2) ──
  // Каждый полный 24-часовой период = 1 день + 1 ночь
  // Последний отрезок зависит от времени возврата

  const fullDays = calendarSpan // Дневных смен = количество переходов
  const fullNights = calendarSpan - 1 // Ночных = промежуточные ночи

  // Если вернули после 10:00 в последний день → ещё одна ночная
  const lastNight = endMin > NIGHT_END_MINUTES ? 1 : 0
  // Если вернули до 10:00 в последний день → одна дневная меньше
  const dayAdjust = endMin <= NIGHT_END_MINUTES ? -1 : 0

  const dayUnits = Math.max(1, fullDays + dayAdjust)
  const nightUnits = fullNights + lastNight

  return {
    dayUnits,
    nightUnits,
    totalUnits: dayUnits + nightUnits,
  }
}

/**
 * Расчёт смен с учётом ручного выбора типа (manual override)
 */
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

  // При ручном выборе: все единицы идут в один тип
  if (shiftType === 'night') {
    return { dayUnits: 0, nightUnits: auto.totalUnits, totalUnits: auto.totalUnits }
  }

  return { dayUnits: auto.totalUnits, nightUnits: 0, totalUnits: auto.totalUnits }
}

/* ────────────────────────────────────────────────────
   Ставки и описания
   ──────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────
   Расчёт для отображения позиций заказа
   ──────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────
   Пересчёт всех позиций заказа
   ──────────────────────────────────────────────────── */

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
