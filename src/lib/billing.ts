/**
 * Dream Art — единая функция биллинга заказа.
 *
 * Single source of truth: одна формула, которая:
 *  1) В preview на форме получает планируемые даты + дефолтное время (09:30 → 23:00)
 *  2) На закрытии заказа получает фактические timestamps (actual_start_at → now())
 * и в обоих случаях возвращает {day_units, night_units, subtotal per item, total}.
 *
 * Все правила «+-» Dream Art в одной функции `computeShifts`.
 */

import { getTashkentDate, getTashkentTime } from './utils'

export type ShiftType = 'day' | 'night'
export type RateSource = 'auto' | 'manual'
export type ShiftCapability = 'day' | 'night' | 'both'

/* ──────── Константы ──────── */

/** Ночная смена начинается в 20:00 */
const NIGHT_START_MIN = 20 * 60
/** Ночная смена заканчивается в 10:00 следующего дня */
const NIGHT_END_MIN = 10 * 60

/** Дефолты для preview-расчёта, когда фактическое время ещё не известно */
export const DEFAULT_START_TIME = '09:30'
export const DEFAULT_END_TIME = '23:00'

/* ──────── Типы ──────── */

export interface ShiftBreakdown {
  day_units: number
  night_units: number
  total_units: number
}

export interface BillingItemInput {
  equipment_id: string
  day_rate: number
  night_rate: number | null
  day_night?: ShiftCapability | null
  /** Если `manual` — все смены уходят в указанный shift_type */
  override?: ShiftType | null
  /** Доплата за смену по платному комплекту (Σ unit_price × qty). Прибавляется к subtotal × смены. */
  kit_per_shift?: number | null
}

export interface BillingItemResult {
  equipment_id: string
  day_rate: number
  night_rate: number
  day_units: number
  night_units: number
  subtotal: number
  shift_type: ShiftType
  rate_source: RateSource
}

export interface BillingResult {
  day_units: number
  night_units: number
  total_units: number
  total_amount: number
  items: BillingItemResult[]
  /** "1 день + 1 ночь" для отображения */
  explanation: string
}

/* ──────── Utilities ──────── */

interface LocalParts {
  date: string   // YYYY-MM-DD (Asia/Tashkent)
  time: string   // HH:MM (Asia/Tashkent)
  minutes: number
}

function toTashkentLocal(d: Date): LocalParts {
  const date = getTashkentDate(d)
  const time = getTashkentTime(d)
  const [h, m] = time.split(':').map(Number)
  return { date, time, minutes: h * 60 + m }
}

function calendarDaysBetween(aDate: string, bDate: string): number {
  const a = new Date(`${aDate}T00:00:00Z`)
  const b = new Date(`${bDate}T00:00:00Z`)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function pack(day: number, night: number): ShiftBreakdown {
  return { day_units: day, night_units: night, total_units: day + night }
}

function normalizeShiftCapability(value?: ShiftCapability | null): ShiftCapability {
  return value ?? 'both'
}

export function supportsNightShift(eq?: { day_night?: ShiftCapability | null } | null): boolean {
  return normalizeShiftCapability(eq?.day_night) !== 'day'
}

/**
 * Из "YYYY-MM-DD" + "HH:MM" в Asia/Tashkent → Date (UTC).
 * Используется в preview для превращения дат формы в Date для `computeOrderBilling`.
 */
export function buildTashkentDate(dateStr: string, timeStr: string = '09:30'): Date {
  const [hStr = '00', mStr = '00'] = timeStr.split(':')
  const h = hStr.padStart(2, '0')
  const m = mStr.padStart(2, '0')
  return new Date(`${dateStr}T${h}:${m}:00+05:00`)
}

/* ──────── Основная формула смен ──────── */

/**
 * Правила Dream Art:
 *   • Тот же день · взял <20:00                         → 1 день
 *   • Тот же день · взял ≥20:00                         → 1 ночь
 *   • Сутки · взял ≥20:00 · вернул ≤10:00              → 1 ночь
 *   • Сутки · взял ≥20:00 · вернул <20:00              → 1 ночь
 *   • Сутки · взял ≥20:00 · вернул ≥20:00              → 2 ночи
 *   • Сутки · взял <20:00 · вернул ≤10:00              → 1 день  (утренний переход бесплатно)
 *   • Сутки · взял <20:00 · вернул >10:00              → 1 день + 1 ночь
 *   • ≥2 дней                                          → span дней + коррекция по последнему времени
 */
export function computeShifts(start: Date, end: Date): ShiftBreakdown {
  const s = toTashkentLocal(start)
  const e = toTashkentLocal(end)
  const span = calendarDaysBetween(s.date, e.date)
  const startedEvening = s.minutes >= NIGHT_START_MIN

  // Возврат «в прошлое» — защитно.
  if (span < 0) return pack(1, 0)

  // Вечерняя аренда остаётся ночной до следующего порога 20:00.
  // Каждый следующий календарный порог 20:00 открывает ещё одну ночную смену.
  if (startedEvening) {
    const nightUnits = Math.max(1, span + (e.minutes >= NIGHT_START_MIN ? 1 : 0))
    return pack(0, nightUnits)
  }

  // Тот же день для дневного старта.
  if (span === 0) return pack(1, 0)

  // Сутки
  if (span === 1) {
    const endBeforeMorning = e.minutes <= NIGHT_END_MIN

    if (endBeforeMorning) return pack(1, 0)
    return pack(1, 1)
  }

  // ≥2 дней: каждая ночь между календарными датами считается с 20:00.
  // Если клиент держит технику после полуночи, текущая ночь уже должна идти,
  // даже если 10:00 ещё не наступило.
  const fullDays = span
  const fullNights = span
  const dayAdjust = e.minutes <= NIGHT_END_MIN ? -1 : 0
  return pack(Math.max(1, fullDays + dayAdjust), fullNights)
}

export function getDominantShiftType(b: ShiftBreakdown): ShiftType {
  return b.night_units > b.day_units ? 'night' : 'day'
}

/* ──────── Человекочитаемое описание ──────── */

export function describeShift(shift: ShiftType): string {
  return shift === 'night' ? 'Ночная смена' : 'Дневная смена'
}

export function describeUnits(count: number, shift: ShiftType): string {
  if (shift === 'night') {
    return `${count} ${count === 1 ? 'ночь' : count < 5 ? 'ночи' : 'ночей'}`
  }
  return `${count} ${count === 1 ? 'день' : count < 5 ? 'дня' : 'дней'}`
}

export function describeBreakdown(dayUnits: number, nightUnits: number): string {
  const parts: string[] = []
  if (dayUnits > 0) {
    parts.push(`${dayUnits} ${dayUnits === 1 ? 'день' : dayUnits < 5 ? 'дня' : 'дней'}`)
  }
  if (nightUnits > 0) {
    parts.push(`${nightUnits} ${nightUnits === 1 ? 'ночь' : nightUnits < 5 ? 'ночи' : 'ночей'}`)
  }
  return parts.join(' + ') || '1 день'
}

/* ──────── Главная функция ──────── */

/**
 * Единая точка входа биллинга.
 *
 * @example Preview в форме
 *   computeOrderBilling({
 *     start: buildTashkentDate('2026-04-18', '09:30'),
 *     end:   buildTashkentDate('2026-04-19', '23:00'),
 *     items: [...]
 *   })
 *
 * @example Закрытие заказа (авто по фактическим timestamps)
 *   computeOrderBilling({
 *     start: new Date(order.actual_start_at),
 *     end:   new Date(),
 *     items: orderItems.map(toBillingInput)
 *   })
 */
export function computeOrderBilling(input: {
  start: Date
  end: Date
  items: BillingItemInput[]
}): BillingResult {
  const autoBreakdown = computeShifts(input.start, input.end)

  const items: BillingItemResult[] = input.items.map(it => {
    const capability = normalizeShiftCapability(it.day_night)
    const nightRate = it.night_rate ?? it.day_rate

    let dayUnits = autoBreakdown.day_units
    let nightUnits = autoBreakdown.night_units
    let rateSource: RateSource = 'auto'
    let shiftType: ShiftType = getDominantShiftType(autoBreakdown)

    // Manual override: все единицы уходят в выбранный тип
    if (it.override === 'day') {
      dayUnits = autoBreakdown.total_units
      nightUnits = 0
      rateSource = 'manual'
      shiftType = 'day'
    } else if (it.override === 'night') {
      dayUnits = 0
      nightUnits = autoBreakdown.total_units
      rateSource = 'manual'
      shiftType = 'night'
    }

    if (capability === 'day') {
      dayUnits += nightUnits
      nightUnits = 0
      shiftType = 'day'
    } else if (capability === 'night') {
      nightUnits += dayUnits
      dayUnits = 0
      shiftType = 'night'
    }

    const kitPerShift = it.kit_per_shift ?? 0
    const subtotal = it.day_rate * dayUnits + nightRate * nightUnits + kitPerShift * (dayUnits + nightUnits)

    return {
      equipment_id: it.equipment_id,
      day_rate: it.day_rate,
      night_rate: nightRate,
      day_units: dayUnits,
      night_units: nightUnits,
      subtotal,
      shift_type: shiftType,
      rate_source: rateSource,
    }
  })

  const total_amount = items.reduce((sum, it) => sum + it.subtotal, 0)

  return {
    day_units: autoBreakdown.day_units,
    night_units: autoBreakdown.night_units,
    total_units: autoBreakdown.total_units,
    total_amount,
    items,
    explanation: describeBreakdown(autoBreakdown.day_units, autoBreakdown.night_units),
  }
}

/* ──────── Per-item active-order billing ──────── */

export interface ActiveItemInput {
  id: string
  equipment_id: string
  rate_source: RateSource | null
  /** ISO timestamp когда позиция стала биллиться (inherit от заказа или now() для дозаказа) */
  actual_start_at: string | null
  /** Если не null — позиция уже сдана, используем final_subtotal */
  actual_end_at: string | null
  /** Замороженная сумма при частичной сдаче; null = считать live */
  final_subtotal: number | null
  final_day_units: number | null
  final_night_units: number | null
  /** Ставки для live-расчёта auto-позиций */
  day_rate: number
  night_rate: number | null
  day_night?: ShiftCapability | null
  /** Fallback / manual subtotal, если manual rate_source или нет actual_start_at */
  subtotal: number
  day_units: number
  night_units: number
  shift_type: ShiftType
  /**
   * Ручная цена позиции. Если задана — итог заморожен на этой сумме и не зависит
   * от фактической длительности (actual_start_at → now()).
   */
  manual_subtotal?: number | null
  /** Доплата за смену по платному комплекту (Σ unit_price × qty). */
  kit_per_shift?: number | null
}

export interface ActiveItemResult {
  id: string
  subtotal: number
  day_units: number
  night_units: number
  shift_type: ShiftType
  frozen: boolean
}

export interface ActiveOrderTotalResult {
  total_amount: number
  perItem: Map<string, ActiveItemResult>
}

/**
 * Для активных/просроченных заказов — считает текущий итог заказа с учётом того,
 * что часть позиций уже могла быть сдана (final_subtotal) или добавлена позже
 * (actual_start_at отличается от остальных).
 */
export function computeActiveOrderTotal(args: {
  now: Date
  items: ActiveItemInput[]
}): ActiveOrderTotalResult {
  const perItem = new Map<string, ActiveItemResult>()
  let total = 0

  for (const it of args.items) {
    // 0) Ручная цена — итог заморожен, фактическая длительность игнорируется.
    //    Приоритетнее живого расчёта, но уступает уже сданной позиции (final_subtotal).
    if (it.manual_subtotal != null && it.final_subtotal == null && it.actual_end_at == null) {
      perItem.set(it.id, {
        id: it.id,
        subtotal: it.manual_subtotal,
        day_units: it.day_units ?? 0,
        night_units: it.night_units ?? 0,
        shift_type: it.shift_type,
        frozen: true,
      })
      total += it.manual_subtotal
      continue
    }

    // 1) Уже сданная позиция — берём замороженные значения
    if (it.final_subtotal != null || it.actual_end_at != null) {
      const subtotal = it.final_subtotal ?? it.subtotal
      const dayU = it.final_day_units ?? it.day_units ?? 0
      const nightU = it.final_night_units ?? it.night_units ?? 0
      perItem.set(it.id, {
        id: it.id,
        subtotal,
        day_units: dayU,
        night_units: nightU,
        shift_type: nightU > dayU ? 'night' : 'day',
        frozen: true,
      })
      total += subtotal
      continue
    }

    // 2) Live-расчёт от actual_start_at до now().
    // Manual rate_source меняет только ставку/тип смены, но не замораживает активный заказ.
    if (it.actual_start_at) {
      const billing = computeOrderBilling({
        start: new Date(it.actual_start_at),
        end: args.now,
        items: [{
          equipment_id: it.equipment_id,
          day_rate: it.day_rate,
          night_rate: it.night_rate,
          day_night: it.day_night,
          override: it.rate_source === 'manual' ? it.shift_type : null,
        }],
      })
      const billed = billing.items[0]
      const sub = billed?.subtotal ?? it.subtotal
      perItem.set(it.id, {
        id: it.id,
        subtotal: sub,
        day_units: billed?.day_units ?? billing.day_units,
        night_units: billed?.night_units ?? billing.night_units,
        shift_type: billed?.shift_type ?? getDominantShiftType({
          day_units: billing.day_units,
          night_units: billing.night_units,
          total_units: billing.total_units,
        }),
        frozen: false,
      })
      total += sub
      continue
    }

    // 4) Fallback — сохранённый subtotal
    perItem.set(it.id, {
      id: it.id,
      subtotal: it.subtotal,
      day_units: it.day_units,
      night_units: it.night_units,
      shift_type: it.shift_type,
      frozen: false,
    })
    total += it.subtotal
  }

  return { total_amount: total, perItem }
}

/* ──────── Вспомогательные для отображения ──────── */

/** Вернуть ставку по типу смены (учитывает equipment без ночной ставки) */
export function getEquipmentRate(
  eq: { day_rate?: number | null; night_rate?: number | null; daily_rate?: number | null; day_night?: ShiftCapability | null },
  shift: ShiftType,
): number {
  const dayRate = eq.day_rate ?? eq.daily_rate ?? 0
  const nightRate = eq.night_rate ?? dayRate
  const capability = normalizeShiftCapability(eq.day_night)
  if (capability === 'night') return nightRate
  if (shift === 'night' && capability !== 'day') return nightRate
  return dayRate
}

/**
 * Из сохранённой позиции заказа собрать массив частей для строки
 *  «Дневная 150 000 × 2 дня + Ночная 100 000 × 1 ночь»
 */
export function getPricingParts(item: {
  day_units?: number | null
  night_units?: number | null
  days?: number | null
  shift_type?: ShiftType | null
  daily_rate?: number | null
  day_rate_snapshot?: number | null
  night_rate_snapshot?: number | null
}): { shiftType: ShiftType; units: number; rate: number }[] {
  const dayRate = item.day_rate_snapshot ?? item.daily_rate ?? 0
  const nightRate = item.night_rate_snapshot ?? item.day_rate_snapshot ?? item.daily_rate ?? 0

  const explicitDay = item.day_units ?? 0
  const explicitNight = item.night_units ?? 0

  if (explicitDay > 0 || explicitNight > 0) {
    const parts: { shiftType: ShiftType; units: number; rate: number }[] = []
    if (explicitDay > 0) parts.push({ shiftType: 'day', units: explicitDay, rate: dayRate })
    if (explicitNight > 0) parts.push({ shiftType: 'night', units: explicitNight, rate: nightRate })
    return parts
  }

  // Legacy: только days + shift_type
  const fallbackDays = Math.max(1, item.days ?? 1)
  return item.shift_type === 'night'
    ? [{ shiftType: 'night', units: fallbackDays, rate: nightRate }]
    : [{ shiftType: 'day', units: fallbackDays, rate: dayRate }]
}
