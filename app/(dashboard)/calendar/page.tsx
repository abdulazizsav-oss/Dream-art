'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  CalendarSearch,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Moon,
  Search,
  Sun,
  Wrench,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { cn, getTashkentDate } from '@/lib/utils'

type OrderStatus = 'active' | 'overdue' | 'draft' | 'returned' | 'cancelled'
type CalendarView = 'orders' | 'equipment'

interface CalendarOrder {
  id: string
  order_number: string
  start_date: string
  end_date: string
  timeline_end_date: string
  start_time: string
  end_time: string
  actual_start_at: string | null
  actual_end_at: string | null
  status: OrderStatus
  created_at: string | null
  created_by: string | null
  created_by_name: string | null
  client: { full_name: string; phone: string | null } | null
  items: {
    id: string
    equipment_id: string
    name: string
    category_id: string | null
    currency: string
    shift_type: 'day' | 'night'
    daily_rate: number
  }[]
}

interface Allocation {
  id: string
  order_id: string
  order_number: string
  equipment_id: string
  equipment_name: string
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  actual_start_at: string | null
  actual_end_at: string | null
  status: OrderStatus
  shift_type: 'day' | 'night'
  client_name: string
  client_phone: string | null
  created_by_name: string | null
  conflict_order_ids: string[]
}

interface ResourceEvent {
  id: string
  equipment_id: string
  equipment_name: string
  start_date: string
  end_date: string
  label: string
  type: 'blocked' | 'maintenance'
  cost?: number | null
}

interface CalendarData {
  orders: CalendarOrder[]
  allocations: Allocation[]
  blocked: ResourceEvent[]
  maintenance: ResourceEvent[]
  filters: {
    equipment: {
      id: string
      name: string
      category_id: string | null
      status: string
      currency: string
      equipment_categories: { name?: string } | null
    }[]
    categories: { id: string; name: string }[]
    admins: { id: string; full_name: string; role: string }[]
  }
  range: {
    from: string
    to: string
    days: number
    shifted: boolean
    anchor_date: string | null
    timezone: string
  }
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; bar: string; badge: string }> = {
  active: {
    label: 'Активно',
    bar: 'border-emerald-300 bg-emerald-100 text-emerald-950',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  overdue: {
    label: 'Просрочка',
    bar: 'border-red-300 bg-red-100 text-red-950',
    badge: 'bg-red-100 text-red-700',
  },
  returned: {
    label: 'Закрыт',
    bar: 'border-zinc-300 bg-zinc-100 text-zinc-700',
    badge: 'bg-zinc-200 text-zinc-600',
  },
  cancelled: {
    label: 'Отменён',
    bar: 'border-orange-300 bg-orange-100 text-orange-800',
    badge: 'bg-orange-100 text-orange-700',
  },
  draft: {
    label: 'Черновик',
    bar: 'border-blue-300 bg-blue-100 text-blue-800',
    badge: 'bg-blue-100 text-blue-700',
  },
}

const STATUS_FILTERS = [
  { value: 'active', label: 'В работе' },
  { value: 'overdue', label: 'Просрочки' },
  { value: 'returned', label: 'Закрытые' },
  { value: 'draft', label: 'Черновики' },
  { value: 'cancelled', label: 'Отменённые' },
  { value: 'all', label: 'Все' },
] as const

const DAY_WIDTH = 88
const LEFT_WIDTH = 320

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  )
}

function dateRange(from: string, count: number) {
  return Array.from({ length: count }, (_, index) => addDays(from, index))
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatActualDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value)).replace(',', '')
}

function shortTime(value: string) {
  return value.slice(0, 5)
}

function orderTimeLabel(order: CalendarOrder) {
  if (order.actual_start_at) {
    const end = order.actual_end_at
      ? formatActualDateTime(order.actual_end_at)
      : ['active', 'overdue'].includes(order.status)
        ? 'по настоящее время'
        : 'не закрыт'
    return `Факт: ${formatActualDateTime(order.actual_start_at)} – ${end}`
  }

  return `План: ${formatShortDate(order.start_date)} ${shortTime(order.start_time)} – ${formatShortDate(order.end_date)} ${shortTime(order.end_time)}`
}

function clampEvent(start: string, end: string, rangeFrom: string, rangeTo: string) {
  const visibleStart = start < rangeFrom ? rangeFrom : start
  const visibleEnd = end > rangeTo ? rangeTo : end
  return {
    start: daysBetween(rangeFrom, visibleStart),
    length: daysBetween(visibleStart, visibleEnd) + 1,
  }
}

function equipmentNames(order: CalendarOrder) {
  const names = Array.from(new Set(order.items.map(item => item.name)))
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function shiftLabel(items: CalendarOrder['items']) {
  const shifts = new Set(items.map(item => item.shift_type))
  if (shifts.size > 1) return 'День + ночь'
  return shifts.has('night') ? 'Ночь' : 'День'
}

function statusMatches(status: string) {
  return status === 'active' ? 'active' : status
}

export default function CalendarPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const today = getTashkentDate()
  const initialDays = Math.min(62, Math.max(1, Number(searchParams.get('days')) || 14))
  const [view, setView] = useState<CalendarView>(
    searchParams.get('view') === 'equipment' ? 'equipment' : 'orders',
  )
  const [from, setFrom] = useState(searchParams.get('from') || addDays(today, -2))
  const [daysVisible, setDaysVisible] = useState(initialDays)
  const [status, setStatus] = useState(searchParams.get('status') || 'active')
  const [equipmentId, setEquipmentId] = useState(searchParams.get('equipment_id') || '')
  const [categoryId, setCategoryId] = useState(searchParams.get('category_id') || '')
  const [adminId, setAdminId] = useState(searchParams.get('admin_id') || '')
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [data, setData] = useState<CalendarData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nearestRequest, setNearestRequest] = useState(0)
  const nearestRequested = useRef(false)

  const to = addDays(from, daysVisible - 1)
  const days = useMemo(() => dateRange(from, daysVisible), [daysVisible, from])

  const replaceUrl = useCallback((patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '' || value === 'all') params.delete(key)
      else params.set(key, String(value))
    }
    router.replace(`/calendar?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      from,
      to,
      days: String(daysVisible),
      view,
      status,
    })
    if (equipmentId) params.set('equipment_id', equipmentId)
    if (categoryId) params.set('category_id', categoryId)
    if (adminId) params.set('admin_id', adminId)
    if (nearestRequested.current) params.set('nearest', 'true')

    fetch(`/api/calendar?${params.toString()}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить календарь')
        return payload as CalendarData
      })
      .then(payload => {
        setData(payload)
        if (nearestRequested.current && payload.range.shifted) {
          setFrom(payload.range.from)
          replaceUrl({ from: payload.range.from })
        }
        nearestRequested.current = false
      })
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message || 'Не удалось загрузить календарь')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [
    adminId,
    categoryId,
    daysVisible,
    equipmentId,
    from,
    nearestRequest,
    replaceUrl,
    status,
    to,
    view,
  ])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return data?.orders ?? []
    return (data?.orders ?? []).filter(order => [
      order.order_number,
      order.client?.full_name,
      order.client?.phone,
      order.created_by_name,
      equipmentNames(order),
    ].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [data?.orders, search])

  const visibleOrderIds = useMemo(
    () => new Set(filteredOrders.map(order => order.id)),
    [filteredOrders],
  )

  const filteredAllocations = useMemo(
    () => (data?.allocations ?? []).filter(allocation => visibleOrderIds.has(allocation.order_id)),
    [data?.allocations, visibleOrderIds],
  )

  const equipmentRows = useMemo(() => {
    const source = data?.filters.equipment ?? []
    return source.filter(item => {
      if (equipmentId && item.id !== equipmentId) return false
      if (categoryId && item.category_id !== categoryId) return false
      const hasEvent = filteredAllocations.some(event => event.equipment_id === item.id)
        || data?.blocked.some(event => event.equipment_id === item.id)
        || data?.maintenance.some(event => event.equipment_id === item.id)
      return hasEvent || Boolean(equipmentId)
    })
  }, [categoryId, data, equipmentId, filteredAllocations])

  const changeFrom = (next: string) => {
    setFrom(next)
    replaceUrl({ from: next })
  }

  const changeDays = (next: number) => {
    setDaysVisible(next)
    replaceUrl({ days: next })
  }

  const shiftPeriod = (direction: -1 | 1) => {
    changeFrom(addDays(from, direction * daysVisible))
  }

  const requestNearest = () => {
    nearestRequested.current = true
    setNearestRequest(value => value + 1)
  }

  const updateFilter = (
    key: 'view' | 'status' | 'equipment_id' | 'category_id' | 'admin_id',
    value: string,
  ) => {
    if (key === 'view') setView(value as CalendarView)
    if (key === 'status') setStatus(value)
    if (key === 'equipment_id') setEquipmentId(value)
    if (key === 'category_id') setCategoryId(value)
    if (key === 'admin_id') setAdminId(value)
    replaceUrl({ [key]: value })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Календарь"
        description="Аренды, занятость техники, блокировки и техническое обслуживание"
      />

      <div className="rounded-2xl border bg-white p-3 md:p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <SegmentButton active={view === 'orders'} onClick={() => updateFilter('view', 'orders')}>
            По заказам
          </SegmentButton>
          <SegmentButton active={view === 'equipment'} onClick={() => updateFilter('view', 'equipment')}>
            По технике
          </SegmentButton>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="mr-1 text-xs font-medium text-zinc-500">Показывать заказы:</span>
          {STATUS_FILTERS.map(option => (
            <StatusButton
              key={option.value}
              active={status === option.value}
              status={option.value}
              onClick={() => updateFilter('status', option.value)}
            >
              {option.label}
            </StatusButton>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative md:col-span-2 xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                replaceUrl({ q: event.target.value })
              }}
              placeholder="Клиент, телефон, заказ, техника"
              className="min-h-[44px] w-full rounded-xl border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>
          <FilterSelect value={equipmentId} onChange={value => updateFilter('equipment_id', value)}>
            <option value="">Вся техника</option>
            {(data?.filters.equipment ?? []).map(item => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={categoryId} onChange={value => updateFilter('category_id', value)}>
            <option value="">Все категории</option>
            {(data?.filters.categories ?? []).map(item => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={adminId} onChange={value => updateFilter('admin_id', value)}>
            <option value="">Все администраторы</option>
            {(data?.filters.admins ?? []).map(item => (
              <option key={item.id} value={item.id}>{item.full_name}</option>
            ))}
          </FilterSelect>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
          <label className="space-y-1">
            <span className="block text-xs text-zinc-500">Начало периода</span>
            <input
              type="date"
              value={from}
              onChange={event => {
                if (event.target.value) changeFrom(event.target.value)
              }}
              className="min-h-[42px] rounded-xl border px-3 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map(count => (
              <SegmentButton key={count} active={daysVisible === count} onClick={() => changeDays(count)}>
                {count === 7 ? 'Неделя' : count === 14 ? '2 недели' : 'Месяц'}
              </SegmentButton>
            ))}
          </div>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => shiftPeriod(-1)}
              className="min-h-[44px] min-w-[44px] shrink-0 rounded-xl"
              aria-label={`Предыдущий период: ${daysVisible} дней`}
              title="Предыдущий период"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl bg-zinc-50 px-3 text-center sm:min-w-[148px]">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">Период</span>
              <span className="text-sm font-medium tabular-nums text-zinc-700">
                {formatShortDate(from)} – {formatShortDate(to)}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => shiftPeriod(1)}
              className="min-h-[44px] min-w-[44px] shrink-0 rounded-xl"
              aria-label={`Следующий период: ${daysVisible} дней`}
              title="Следующий период"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && (
        <>
          <div className="hidden md:block">
            <DesktopCalendar
              data={data}
              loading={loading}
              days={days}
              from={from}
              to={to}
              today={today}
              view={view}
              orders={filteredOrders}
              allocations={filteredAllocations}
              equipmentRows={equipmentRows}
              onNearest={requestNearest}
            />
          </div>
          <div className="md:hidden">
            <MobileAgenda
              data={data}
              loading={loading}
              days={days}
              orders={filteredOrders}
              today={today}
              onNearest={requestNearest}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3 rounded-xl border bg-white px-4 py-3 text-xs text-zinc-600">
        <Legend color="bg-emerald-200" label="Активная аренда" />
        <Legend color="bg-red-200" label="Просроченная аренда" />
        <Legend color="bg-white ring-2 ring-red-400" label="Конфликт бронирований" />
        <Legend color="bg-zinc-200" label="Закрытый заказ" />
        <Legend color="bg-violet-200" label="ТО" icon={<Wrench className="h-3 w-3" />} />
        <Legend color="bg-amber-200" label="Блокировка" icon={<LockKeyhole className="h-3 w-3" />} />
      </div>
    </div>
  )
}

function DesktopCalendar({
  data,
  loading,
  days,
  from,
  to,
  today,
  view,
  orders,
  allocations,
  equipmentRows,
  onNearest,
}: {
  data: CalendarData | null
  loading: boolean
  days: string[]
  from: string
  to: string
  today: string
  view: CalendarView
  orders: CalendarOrder[]
  allocations: Allocation[]
  equipmentRows: CalendarData['filters']['equipment']
  onNearest: () => void
}) {
  const width = LEFT_WIDTH + days.length * DAY_WIDTH
  const empty = data && (view === 'orders' ? orders.length === 0 : equipmentRows.length === 0)

  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <div style={{ minWidth: width }}>
        <TimelineHeader days={days} today={today} />
        {loading && <CalendarSkeleton days={days.length} />}

        {!loading && empty && (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-6 text-center">
            <CalendarSearch className="h-8 w-8 text-zinc-300" />
            <div>
              <p className="font-medium text-zinc-700">В выбранном периоде событий нет</p>
              <p className="mt-1 text-sm text-zinc-500">Измените фильтры или перейдите к ближайшему заказу.</p>
            </div>
            <Button variant="outline" onClick={onNearest}>Показать ближайший заказ</Button>
          </div>
        )}

        {!loading && view === 'orders' && orders.map(order => (
          <OrderTimelineRow
            key={order.id}
            order={order}
            from={from}
            to={to}
            days={days}
            today={today}
          />
        ))}

        {!loading && view === 'orders' && (data?.filters.equipment ?? [])
          .filter(equipment => (
            data?.blocked.some(event => event.equipment_id === equipment.id)
            || data?.maintenance.some(event => event.equipment_id === equipment.id)
          ))
          .map(equipment => (
            <EquipmentTimelineRow
              key={`resource:${equipment.id}`}
              equipment={equipment}
              allocations={[]}
              blocked={(data?.blocked ?? []).filter(item => item.equipment_id === equipment.id)}
              maintenance={(data?.maintenance ?? []).filter(item => item.equipment_id === equipment.id)}
              from={from}
              to={to}
              days={days}
              today={today}
            />
          ))}

        {!loading && view === 'equipment' && equipmentRows.map(equipment => (
          <EquipmentTimelineRow
            key={equipment.id}
            equipment={equipment}
            allocations={allocations.filter(item => item.equipment_id === equipment.id)}
            blocked={(data?.blocked ?? []).filter(item => item.equipment_id === equipment.id)}
            maintenance={(data?.maintenance ?? []).filter(item => item.equipment_id === equipment.id)}
            from={from}
            to={to}
            days={days}
            today={today}
          />
        ))}
      </div>
    </div>
  )
}

function TimelineHeader({ days, today }: { days: string[]; today: string }) {
  return (
    <div
      className="sticky top-0 z-20 grid border-b bg-zinc-50"
      style={{ gridTemplateColumns: `${LEFT_WIDTH}px repeat(${days.length}, ${DAY_WIDTH}px)` }}
    >
      <div className="sticky left-0 z-30 border-r bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-700">
        Заказ / ресурс
      </div>
      {days.map(day => {
        const date = new Date(`${day}T00:00:00Z`)
        const weekend = [0, 6].includes(date.getUTCDay())
        return (
          <div
            key={day}
            className={cn(
              'border-r px-2 py-2 text-center text-xs',
              weekend && 'bg-zinc-100 text-zinc-500',
              day === today && 'bg-zinc-900 text-white',
            )}
          >
            <div className="font-semibold">{date.getUTCDate()}</div>
            <div className={cn('mt-0.5 text-[10px]', day === today ? 'text-zinc-300' : 'text-zinc-400')}>
              {date.toLocaleDateString('ru-RU', { timeZone: 'UTC', weekday: 'short' })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TimelineBackground({ days, today }: { days: string[]; today: string }) {
  return (
    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${DAY_WIDTH}px)` }}>
      {days.map(day => {
        const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())
        return (
          <div
            key={day}
            className={cn(
              'border-r border-zinc-100',
              weekend && 'bg-zinc-50',
              day === today && 'bg-blue-50/60',
            )}
          />
        )
      })}
    </div>
  )
}

function OrderTimelineRow({
  order,
  from,
  to,
  days,
  today,
}: {
  order: CalendarOrder
  from: string
  to: string
  days: string[]
  today: string
}) {
  const span = clampEvent(order.start_date, order.timeline_end_date, from, to)
  const config = STATUS_CONFIG[order.status]
  return (
    <div className="grid min-h-24 border-b" style={{ gridTemplateColumns: `${LEFT_WIDTH}px ${days.length * DAY_WIDTH}px` }}>
      <Link
        href={`/orders/${order.id}`}
        className={cn(
          'sticky left-0 z-10 border-r px-4 py-3',
          order.status === 'overdue'
            ? 'border-l-4 border-l-red-500 bg-red-50 hover:bg-red-100'
            : 'bg-white hover:bg-zinc-50',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">{order.client?.full_name ?? 'Клиент'}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {order.order_number} · {order.client?.phone ?? 'Без телефона'}
            </p>
          </div>
          <span className={cn('rounded-full px-2 py-1 text-[10px] font-medium', config.badge)}>
            {config.label}
          </span>
        </div>
        <p className="mt-2 line-clamp-1 text-xs text-zinc-600">{equipmentNames(order)}</p>
        <p className={cn(
          'mt-1 text-[11px]',
          order.actual_start_at ? 'font-medium text-zinc-600' : 'text-zinc-400',
        )}>
          {orderTimeLabel(order)}
        </p>
      </Link>
      <div className="relative min-h-24">
        <TimelineBackground days={days} today={today} />
        <Link
          href={`/orders/${order.id}`}
          className={cn(
            'absolute top-4 flex h-14 items-center overflow-hidden rounded-xl border px-3 shadow-sm transition hover:brightness-95',
            config.bar,
          )}
          style={{
            left: span.start * DAY_WIDTH + 4,
            width: Math.max(span.length * DAY_WIDTH - 8, 48),
          }}
          title={`${order.order_number} | ${order.client?.full_name} | ${equipmentNames(order)} | ${orderTimeLabel(order)}`}
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">
              {order.order_number} · {order.client?.full_name}
            </p>
            <p className="mt-1 truncate text-[10px] opacity-75">
              {shiftLabel(order.items)} · {equipmentNames(order)}
              {order.created_by_name ? ` · ${order.created_by_name}` : ''}
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}

function EquipmentTimelineRow({
  equipment,
  allocations,
  blocked,
  maintenance,
  from,
  to,
  days,
  today,
}: {
  equipment: CalendarData['filters']['equipment'][number]
  allocations: Allocation[]
  blocked: ResourceEvent[]
  maintenance: ResourceEvent[]
  from: string
  to: string
  days: string[]
  today: string
}) {
  const events = [
    ...allocations.map(item => ({ ...item, kind: 'order' as const })),
    ...blocked.map(item => ({ ...item, kind: 'blocked' as const })),
    ...maintenance.map(item => ({ ...item, kind: 'maintenance' as const })),
  ]
  const rowHeight = Math.max(80, events.length * 38 + 16)

  return (
    <div
      className="grid border-b"
      style={{
        gridTemplateColumns: `${LEFT_WIDTH}px ${days.length * DAY_WIDTH}px`,
        minHeight: rowHeight,
      }}
    >
      <Link href={`/equipment/${equipment.id}`} className="sticky left-0 z-10 border-r bg-white px-4 py-3 hover:bg-zinc-50">
        <p className="text-sm font-semibold text-zinc-900">{equipment.name}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {equipment.equipment_categories?.name ?? 'Без категории'} · {equipment.status}
        </p>
        <p className="mt-2 text-[11px] text-zinc-400">{events.length} событий</p>
      </Link>
      <div className="relative" style={{ minHeight: rowHeight }}>
        <TimelineBackground days={days} today={today} />
        {events.map((event, index) => {
          const span = clampEvent(event.start_date, event.end_date, from, to)
          if (event.kind === 'order') {
            const config = STATUS_CONFIG[event.status]
            const conflict = event.conflict_order_ids.length > 0
            return (
              <Link
                key={event.id}
                href={`/orders/${event.order_id}`}
                className={cn(
                  'absolute flex h-8 items-center overflow-hidden rounded-lg border px-2 text-[10px] font-medium shadow-sm',
                  config.bar,
                  conflict && 'border-red-600 ring-2 ring-red-300',
                )}
                style={{
                  top: 8 + index * 38,
                  left: span.start * DAY_WIDTH + 4,
                  width: Math.max(span.length * DAY_WIDTH - 8, 44),
                }}
                title={conflict
                  ? `Конфликт с ${event.conflict_order_ids.length} заказом(ами)`
                  : `${event.order_number} | ${event.client_name}${event.actual_start_at
                    ? ` | Факт: ${formatActualDateTime(event.actual_start_at)} – ${event.actual_end_at
                      ? formatActualDateTime(event.actual_end_at)
                      : ['active', 'overdue'].includes(event.status)
                        ? 'по настоящее время'
                        : 'не закрыт'}`
                    : ''}`}
              >
                {(conflict || event.status === 'overdue') && (
                  <AlertTriangle className="mr-1 h-3 w-3 shrink-0 text-red-700" />
                )}
                <span className="truncate">{event.order_number} · {event.client_name}</span>
              </Link>
            )
          }

          const maintenanceEvent = event.kind === 'maintenance'
          return (
            <div
              key={`${event.kind}:${event.id}`}
              className={cn(
                'absolute flex h-8 items-center overflow-hidden rounded-lg border px-2 text-[10px] font-medium shadow-sm',
                maintenanceEvent
                  ? 'border-violet-300 bg-violet-100 text-violet-800'
                  : 'border-amber-300 bg-amber-100 text-amber-800',
              )}
              style={{
                top: 8 + index * 38,
                left: span.start * DAY_WIDTH + 4,
                width: Math.max(span.length * DAY_WIDTH - 8, 44),
              }}
              title={event.label}
            >
              {maintenanceEvent
                ? <Wrench className="mr-1 h-3 w-3 shrink-0" />
                : <LockKeyhole className="mr-1 h-3 w-3 shrink-0" />}
              <span className="truncate">{event.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MobileAgenda({
  data,
  loading,
  days,
  orders,
  today,
  onNearest,
}: {
  data: CalendarData | null
  loading: boolean
  days: string[]
  orders: CalendarOrder[]
  today: string
  onNearest: () => void
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border bg-white" />
        ))}
      </div>
    )
  }

  const totalEvents = orders.length + (data?.blocked.length ?? 0) + (data?.maintenance.length ?? 0)
  if (totalEvents === 0) {
    return (
      <div className="rounded-2xl border bg-white px-6 py-12 text-center">
        <CalendarSearch className="mx-auto h-8 w-8 text-zinc-300" />
        <p className="mt-3 font-medium text-zinc-700">В выбранном периоде событий нет</p>
        <Button variant="outline" className="mt-4" onClick={onNearest}>
          Показать ближайший заказ
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {days.map(day => {
        const dayOrders = orders.filter(order => order.start_date <= day && order.timeline_end_date >= day)
        const dayBlocked = (data?.blocked ?? []).filter(event => event.start_date <= day && event.end_date >= day)
        const dayMaintenance = (data?.maintenance ?? []).filter(event => event.start_date <= day && event.end_date >= day)
        if (dayOrders.length + dayBlocked.length + dayMaintenance.length === 0) return null

        return (
          <section key={day} className={cn('overflow-hidden rounded-2xl border bg-white', day === today && 'border-zinc-900')}>
            <div className={cn('border-b bg-zinc-50 px-4 py-3', day === today && 'bg-zinc-900 text-white')}>
              <h2 className="text-sm font-semibold">{formatDay(day)}{day === today ? ' · Сегодня' : ''}</h2>
            </div>
            <div className="divide-y">
              {dayOrders.map(order => {
                const config = STATUS_CONFIG[order.status]
                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className={cn(
                      'block px-4 py-3 active:bg-zinc-50',
                      order.status === 'overdue' && 'border-l-4 border-red-500 bg-red-50 text-red-950',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{order.client?.full_name ?? 'Клиент'}</p>
                        <p className="mt-1 text-xs text-zinc-500">{order.order_number} · {order.client?.phone ?? 'Без телефона'}</p>
                      </div>
                      <span className={cn('rounded-full px-2 py-1 text-[10px]', config.badge)}>{config.label}</span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-600">{equipmentNames(order)}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
                      <span className={order.actual_start_at ? 'font-medium text-zinc-600' : undefined}>
                        {orderTimeLabel(order)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {shiftLabel(order.items) === 'Ночь'
                          ? <Moon className="h-3 w-3" />
                          : <Sun className="h-3 w-3" />}
                        {shiftLabel(order.items)}
                      </span>
                      {order.created_by_name && <span>Оформил: {order.created_by_name}</span>}
                    </div>
                  </Link>
                )
              })}
              {dayMaintenance.map(event => (
                <ResourceAgendaEvent key={event.id} event={event} />
              ))}
              {dayBlocked.map(event => (
                <ResourceAgendaEvent key={event.id} event={event} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ResourceAgendaEvent({ event }: { event: ResourceEvent }) {
  const maintenance = event.type === 'maintenance'
  return (
    <div className={cn('px-4 py-3', maintenance ? 'bg-violet-50' : 'bg-amber-50')}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {maintenance ? <Wrench className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
        {event.equipment_name}
      </div>
      <p className="mt-1 text-xs opacity-70">{event.label}</p>
    </div>
  )
}

function CalendarSkeleton({ days }: { days: number }) {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid min-h-24 border-b"
          style={{ gridTemplateColumns: `${LEFT_WIDTH}px ${days * DAY_WIDTH}px` }}
        >
          <div className="sticky left-0 z-10 border-r bg-white p-4">
            <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="p-4">
            <div className="h-14 w-2/5 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[40px] rounded-xl border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
      )}
    >
      {children}
    </button>
  )
}

function StatusButton({
  active,
  status,
  onClick,
  children,
}: {
  active: boolean
  status: typeof STATUS_FILTERS[number]['value']
  onClick: () => void
  children: React.ReactNode
}) {
  const activeClass = status === 'overdue'
    ? 'border-red-600 bg-red-600 text-white'
    : status === 'returned'
      ? 'border-zinc-700 bg-zinc-700 text-white'
      : status === 'draft'
        ? 'border-blue-600 bg-blue-600 text-white'
        : status === 'cancelled'
          ? 'border-orange-600 bg-orange-600 text-white'
          : status === 'active'
            ? 'border-emerald-700 bg-emerald-700 text-white'
            : 'border-zinc-900 bg-zinc-900 text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors',
        active ? activeClass : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
      )}
    >
      {children}
    </button>
  )
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="min-h-[44px] rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
    >
      {children}
    </select>
  )
}

function Legend({ color, label, icon }: { color: string; label: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon ?? <span className={cn('h-3 w-3 rounded-sm', color)} />}
      {label}
    </span>
  )
}
