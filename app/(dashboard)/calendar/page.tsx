'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CalendarOrder {
  id: string
  order_number: string
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  status: 'active' | 'overdue' | 'draft' | 'returned' | 'cancelled'
  created_at: string | null
  created_by_name: string | null
  client: { full_name: string; phone: string | null } | null
  items: {
    id: string
    equipment_id: string
    name: string
    shift_type: 'day' | 'night'
    daily_rate: number
  }[]
}

interface CalendarData {
  orders: CalendarOrder[]
}

const DEFAULT_DAYS_VISIBLE = 14

const STATUS_CONFIG: Record<string, { label: string; bg: string; border: string; text: string }> = {
  active:    { label: 'Активно',    bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-950' },
  overdue:   { label: 'Просрочка',  bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-900' },
  returned:  { label: 'Завершён',   bg: 'bg-zinc-100',    border: 'border-zinc-200',    text: 'text-zinc-600' },
  cancelled: { label: 'Отменён',    bg: 'bg-orange-50',   border: 'border-orange-200',  text: 'text-orange-700' },
  draft:     { label: 'Черновик',   bg: 'bg-blue-50',     border: 'border-blue-200',    text: 'text-blue-700' },
}

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-100 text-emerald-700',
  overdue:   'bg-red-100 text-red-700',
  returned:  'bg-zinc-200 text-zinc-600',
  cancelled: 'bg-orange-100 text-orange-700',
  draft:     'bg-blue-100 text-blue-700',
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDateString(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isBetween(day: string, start: string, end: string) {
  return start <= day && end >= day
}

function firstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] ?? 'Клиент'
}

function shortEquipmentList(items: CalendarOrder['items']) {
  const names = items.map(item => item.name)
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

export default function CalendarPage() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 2)
    return date
  })
  const [daysVisible, setDaysVisible] = useState(DEFAULT_DAYS_VISIBLE)
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<CalendarData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const endDate = addDays(startDate, daysVisible - 1)
  const fromDateString = toDateString(startDate)
  const toDateStringValue = toDateString(endDate)
  const days = useMemo(
    () => Array.from({ length: daysVisible }, (_, index) => addDays(startDate, index)),
    [daysVisible, startDate],
  )
  const today = toDateString(new Date())

  useEffect(() => {
    setData(null)
    setError(null)
    fetch(`/api/calendar?from=${fromDateString}&to=${toDateStringValue}`)
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить календарь')
        return response.json()
      })
      .then(setData)
      .catch(err => setError(err.message ?? 'Не удалось загрузить календарь'))
  }, [fromDateString, toDateStringValue])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()

    return (data?.orders ?? []).filter(order => {
      if (statusFilter === 'active' && !['active', 'overdue'].includes(order.status)) return false
      if (statusFilter === 'overdue' && order.status !== 'overdue') return false
      if (statusFilter === 'returned' && order.status !== 'returned') return false
      if (statusFilter === 'cancelled' && order.status !== 'cancelled') return false
      // 'all' shows everything

      if (!term) return true

      return [
        order.order_number,
        order.client?.full_name ?? '',
        order.client?.phone ?? '',
        order.created_by_name ?? '',
        shortEquipmentList(order.items),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [data?.orders, search, statusFilter])

  // Count by status for badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { active: 0, overdue: 0, returned: 0, cancelled: 0, all: 0 }
    for (const o of data?.orders ?? []) {
      counts[o.status] = (counts[o.status] ?? 0) + 1
      counts.all++
    }
    // active filter includes overdue
    counts.active += counts.overdue
    return counts
  }, [data?.orders])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Календарь заказов"
        description="Все заказы на временной шкале"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => setStartDate(date => addDays(date, -daysVisible))}
              aria-label="Предыдущий период"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="outline" className="min-h-[44px] px-4" onClick={() => setStartDate(new Date())}>
              Сегодня
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => setStartDate(date => addDays(date, daysVisible))}
              aria-label="Следующий период"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        }
      />

      <div className="rounded-2xl border bg-white p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,1fr)_200px_160px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по клиенту, заказу, телефону"
              className="min-h-[44px] w-full rounded-xl border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="min-h-[44px] rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value="active">Активные ({statusCounts.active})</option>
            <option value="overdue">Просрочки ({statusCounts.overdue})</option>
            <option value="returned">Завершённые ({statusCounts.returned})</option>
            <option value="cancelled">Отменённые ({statusCounts.cancelled})</option>
            <option value="all">Все ({statusCounts.all})</option>
          </select>
          <select
            value={daysVisible}
            onChange={e => setDaysVisible(Number(e.target.value))}
            className="min-h-[44px] rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value={7}>Неделя</option>
            <option value={14}>2 недели</option>
            <option value={30}>Месяц</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border bg-white">
        <table className="w-full border-collapse text-xs" style={{ minWidth: `${320 + daysVisible * 96}px` }}>
          <thead>
            <tr className="border-b bg-zinc-50">
              <th className="sticky left-0 z-20 w-80 min-w-80 border-r bg-zinc-50 px-4 py-3 text-left font-semibold text-zinc-700">
                Заказ / клиент
              </th>
              {days.map(day => {
                const value = toDateString(day)
                const isToday = value === today
                const isWeekend = [0, 6].includes(day.getDay())
                return (
                  <th
                    key={value}
                    className={cn(
                      'w-[96px] min-w-[96px] border-r border-zinc-100 py-2 text-center font-normal',
                      isToday && 'bg-zinc-900 text-white',
                      isWeekend && !isToday && 'bg-zinc-100 text-zinc-500',
                    )}
                  >
                    <div className="text-sm tabular-nums">{day.getDate()}</div>
                    <div className={cn('text-[10px]', isToday ? 'text-zinc-200' : 'text-zinc-400')}>
                      {day.toLocaleDateString('ru', { weekday: 'short' })}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {!data && !error && (
              <>
                {Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b">
                    <td className="sticky left-0 z-10 min-w-80 border-r bg-white px-4 py-4">
                      <div className="mb-2 h-4 w-40 animate-pulse rounded-full bg-zinc-200" />
                      <div className="mb-2 h-3 w-28 animate-pulse rounded-full bg-zinc-100" />
                      <div className="h-3 w-52 animate-pulse rounded-full bg-zinc-100" />
                    </td>
                    {Array.from({ length: daysVisible }).map((_, cell) => (
                      <td key={cell} className="h-20 border-r border-zinc-100 p-1">
                        {cell % 7 === index % 4 ? (
                          <div className="h-full w-full animate-pulse rounded-xl bg-zinc-100" />
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}

            {error && (
              <tr>
                <td colSpan={daysVisible + 1} className="py-12 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}

            {data && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={daysVisible + 1} className="py-12 text-center text-zinc-500">
                  Ничего не найдено
                </td>
              </tr>
            )}

            {filteredOrders.map(order => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.active
              const badgeCls = STATUS_BADGE[order.status] ?? STATUS_BADGE.active

              return (
                <tr key={order.id} className="border-b align-top hover:bg-zinc-50/60">
                  <td className="sticky left-0 z-10 min-w-80 border-r bg-white px-4 py-4">
                    <Link href={`/orders/${order.id}`} className="block">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-900">
                            {order.client?.full_name ?? 'Клиент'}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {order.order_number} · {order.client?.phone ?? 'Без телефона'}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                            {shortEquipmentList(order.items)}
                          </p>
                        </div>
                        <span className={cn('rounded-full px-2 py-1 text-[10px] font-medium whitespace-nowrap', badgeCls)}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                        <span>{order.start_date} {order.start_time}</span>
                        <span>{order.end_date} {order.end_time}</span>
                        {order.created_by_name && <span>Оформил: {order.created_by_name}</span>}
                      </div>
                    </Link>
                  </td>

                  {days.map(day => {
                    const value = toDateString(day)
                    const visible = isBetween(value, order.start_date, order.end_date)
                    const isToday = value === today

                    return (
                      <td
                        key={value}
                        className={cn(
                          'h-20 border-r border-zinc-100 p-1 align-top',
                          isToday && 'ring-1 ring-inset ring-zinc-900',
                        )}
                      >
                        {visible ? (
                          <Link
                            href={`/orders/${order.id}`}
                            title={[
                              order.order_number,
                              order.client?.full_name,
                              order.client?.phone,
                              order.created_by_name ? `Оформил: ${order.created_by_name}` : '',
                              `${order.start_date} ${order.start_time} – ${order.end_date} ${order.end_time}`,
                              shortEquipmentList(order.items),
                            ].filter(Boolean).join(' | ')}
                            className={cn(
                              'block h-full rounded-xl border px-2 py-1.5 transition-colors',
                              cfg.border, cfg.bg, cfg.text,
                              order.status === 'active' && 'hover:bg-emerald-100',
                              order.status === 'overdue' && 'hover:bg-red-100',
                              order.status === 'returned' && 'hover:bg-zinc-200',
                              order.status === 'cancelled' && 'hover:bg-orange-100',
                            )}
                          >
                            <span className="mb-1 block text-[9px] font-mono opacity-60">
                              {order.order_number.replace('DA-', '#')}
                            </span>
                            <span className="block truncate text-[10px] font-semibold leading-tight">
                              {firstName(order.client?.full_name)}
                            </span>
                            <span className="mt-1 block line-clamp-2 text-[9px] leading-tight opacity-70">
                              {shortEquipmentList(order.items)}
                            </span>
                          </Link>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
