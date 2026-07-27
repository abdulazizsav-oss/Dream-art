export interface CalendarAnchorOrder {
  start_date: string
  end_date: string | null
  status: string
}

export interface CalendarWindow {
  from: string
  to: string
}

export interface CalendarConflictSegment {
  key: string
  orderId: string
  equipmentId: string
  from: string
  to: string
}

const ACTIVE_STATUSES = new Set(['active', 'overdue'])

function dateNumber(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / 86400000
}

export function addDaysToDateString(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export function calendarRangeDays(from: string, to: string) {
  return Math.round(dateNumber(to) - dateNumber(from)) + 1
}

export function buildCalendarWindow(anchorDate: string, daysVisible: number, daysBefore = 2): CalendarWindow {
  const safeDaysVisible = Math.max(1, Math.floor(daysVisible) || 14)
  const from = addDaysToDateString(anchorDate, -daysBefore)
  return {
    from,
    to: addDaysToDateString(from, safeDaysVisible - 1),
  }
}

function distanceFromReference(order: CalendarAnchorOrder, referenceDate: string) {
  const reference = dateNumber(referenceDate)
  const start = dateNumber(order.start_date)
  const end = dateNumber(order.end_date ?? order.start_date)
  if (start <= reference && end >= reference) return 0
  return Math.min(Math.abs(start - reference), Math.abs(end - reference))
}

export function chooseNearestCalendarAnchor(
  orders: CalendarAnchorOrder[],
  referenceDate: string,
): CalendarAnchorOrder | null {
  if (orders.length === 0) return null

  const active = orders.filter(order => ACTIVE_STATUSES.has(order.status))
  if (active.length > 0) {
    return [...active].sort((a, b) => {
      const distance = distanceFromReference(a, referenceDate) - distanceFromReference(b, referenceDate)
      if (distance !== 0) return distance
      return b.start_date.localeCompare(a.start_date)
    })[0] ?? null
  }

  return [...orders].sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null
}

export function findCalendarConflicts(segments: CalendarConflictSegment[]) {
  const conflicts: Record<string, string[]> = {}

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex++) {
    const left = segments[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex++) {
      const right = segments[rightIndex]
      if (
        left.orderId !== right.orderId
        && left.equipmentId === right.equipmentId
        && left.from <= right.to
        && left.to >= right.from
      ) {
        conflicts[left.key] = Array.from(new Set([...(conflicts[left.key] ?? []), right.orderId]))
        conflicts[right.key] = Array.from(new Set([...(conflicts[right.key] ?? []), left.orderId]))
      }
    }
  }

  return conflicts
}
