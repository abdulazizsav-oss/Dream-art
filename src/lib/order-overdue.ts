import {
  buildTashkentDate,
  computeShifts,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
} from './billing'
import { getTashkentDate } from './utils'

const OPEN_RENTAL_STATUSES = new Set(['active', 'overdue'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface RentalOverdueInput {
  status?: string | null
  endDate?: string | null
  startDate?: string | null
  startTime?: string | null
  endTime?: string | null
  actualStartAt?: string | null
  actualEndAt?: string | null
  actualReturnDate?: string | null
  returned?: boolean | null
  dayUnits?: number | null
  nightUnits?: number | null
  days?: number | null
  now?: Date
}

function isIsoDate(value?: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function addCalendarDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

/**
 * A position added later has its own rental clock but no separate `end_date`.
 * In that case the order-level end date belongs to the original positions and
 * must not make the newly added position overdue immediately.
 */
export function applicableRentalEndDate(input: {
  orderEndDate?: string | null
  orderActualStartAt?: string | null
  itemActualStartAt?: string | null
}) {
  if (!input.itemActualStartAt) return input.orderEndDate ?? null

  const itemStart = new Date(input.itemActualStartAt).getTime()
  const orderStart = input.orderActualStartAt
    ? new Date(input.orderActualStartAt).getTime()
    : Number.NaN

  if (Number.isFinite(itemStart) && (!Number.isFinite(orderStart) || itemStart !== orderStart)) {
    return null
  }

  return input.orderEndDate ?? null
}

export function plannedRentalUnits(input: RentalOverdueInput) {
  const explicitUnits = Math.max(0, Number(input.dayUnits ?? 0))
    + Math.max(0, Number(input.nightUnits ?? 0))
  if (explicitUnits > 0) return Math.max(1, Math.ceil(explicitUnits))

  if (isIsoDate(input.startDate) && isIsoDate(input.endDate)) {
    const plannedStart = buildTashkentDate(
      input.startDate,
      input.startTime || DEFAULT_START_TIME,
    )
    const plannedEnd = buildTashkentDate(
      input.endDate,
      input.endTime || DEFAULT_END_TIME,
    )
    if (plannedEnd.getTime() >= plannedStart.getTime()) {
      return computeShifts(plannedStart, plannedEnd).total_units
    }
  }

  const legacyDays = Number(input.days ?? 1)
  return Number.isFinite(legacyDays) ? Math.max(1, Math.ceil(legacyDays)) : 1
}

function rentalStart(input: RentalOverdueInput) {
  if (input.actualStartAt) {
    const actual = new Date(input.actualStartAt)
    if (!Number.isNaN(actual.getTime())) return actual
  }

  if (isIsoDate(input.startDate)) {
    return buildTashkentDate(input.startDate, input.startTime || DEFAULT_START_TIME)
  }

  return null
}

/**
 * Planned calendar end used by day-based views.
 *
 * `end_date` remains authoritative when present. For inconsistent legacy rows
 * without it, the saved number of billed shifts gives a conservative calendar
 * fallback; the exact overdue boundary is still decided by `computeShifts`.
 */
export function resolveRentalEndDate(input: RentalOverdueInput) {
  if (isIsoDate(input.endDate)) return input.endDate

  const start = rentalStart(input)
  if (!start) return null

  return addCalendarDays(
    getTashkentDate(start),
    plannedRentalUnits(input) - 1,
  )
}

/**
 * A rental is overdue only while it is operationally open and its equipment
 * has not been returned. Debt and payment state intentionally do not take part.
 *
 * Compare the saved/derived planned shift count with the live count from
 * `computeShifts`. `end_date` is only one source for deriving old rows; it does
 * not replace the day/night shift boundary with a calendar-day comparison.
 */
export function isRentalOverdue(input: RentalOverdueInput) {
  if (!OPEN_RENTAL_STATUSES.has(input.status ?? '')) return false
  if (input.returned || input.actualEndAt || input.actualReturnDate) return false

  const now = input.now ?? new Date()
  const start = rentalStart(input)
  if (!start || now.getTime() <= start.getTime()) return false

  return computeShifts(start, now).total_units > plannedRentalUnits(input)
}
