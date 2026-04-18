'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

interface Equipment {
  id: string
  name: string
  status: string
  category_id: string | null
  brand: string | null
  specs: string | null
  equipment_categories: { name: string; is_active: boolean } | null
}

interface Category {
  id: string
  name: string
  slug: string
  sort_order: number
  is_active: boolean
}

interface Booking {
  equipment_id: string
  equipment_name: string
  order: {
    id: string
    order_number: string
    start_date: string
    end_date: string
    status: string
    created_by: string | null
    created_at: string | null
    client: { full_name: string; phone: string | null } | null
  }
}

interface BlockedDate {
  id: string
  equipment_id: string
  start_date: string
  end_date: string
  reason: string | null
}

interface CalendarData {
  equipment: Equipment[]
  categories: Category[]
  bookings: Booking[]
  blocked: BlockedDate[]
  profiles: Record<string, string>
}

const DEFAULT_DAYS_VISIBLE = 14

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
  return value?.trim().split(/\s+/)[0] ?? ''
}

function toTashkentTime(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default function CalendarPage() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 2)
    return date
  })
  const [daysVisible, setDaysVisible] = useState(DEFAULT_DAYS_VISIBLE)
  const [categoryId, setCategoryId] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<CalendarData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const endDate = addDays(startDate, daysVisible - 1)
  const fromDateString = toDateString(startDate)
  const toDateStringValue = toDateString(endDate)
  const days = useMemo(
    () => Array.from({ length: daysVisible }, (_, i) => addDays(startDate, i)),
    [startDate, daysVisible]
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

  const filteredEquipment = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.equipment ?? []).filter(item => {
      const matchesCategory = categoryId === 'all' || item.category_id === categoryId
      const matchesSearch = !term || [
        item.name,
        item.brand ?? '',
        item.specs ?? '',
        item.equipment_categories?.name ?? '',
      ].join(' ').toLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [categoryId, data?.equipment, search])

  const groupedEquipment = useMemo(() => {
    const groups = new Map<string, Equipment[]>()
    for (const item of filteredEquipment) {
      const brand = item.brand?.trim()
      const key = brand
        ? `${item.equipment_categories?.name ?? 'Без категории'} / ${brand}`
        : item.equipment_categories?.name ?? 'Без категории'
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }))
  }, [filteredEquipment])

  function getBooking(equipmentId: string, day: string) {
    const bookings = (data?.bookings ?? []).filter(booking =>
      booking.equipment_id === equipmentId &&
      isBetween(day, booking.order.start_date, booking.order.end_date)
    )

    if (statusFilter === 'overdue') {
      return bookings.find(booking => booking.order.status === 'overdue') ?? null
    }
    return bookings[0] ?? null
  }

  function getBlocked(equipmentId: string, day: string) {
    return (data?.blocked ?? []).find(blocked =>
      blocked.equipment_id === equipmentId &&
      isBetween(day, blocked.start_date, blocked.end_date)
    ) ?? null
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Календарь бронирований"
        description="Кто взял технику, на какие даты и кто оформил заказ"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => setStartDate(date => addDays(date, -daysVisible))}
              aria-label="Предыдущий период"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px] px-4"
              onClick={() => setStartDate(new Date())}
            >
              Сегодня
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => setStartDate(date => addDays(date, daysVisible))}
              aria-label="Следующий период"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        }
      />

      <div className="bg-white rounded-xl border p-3">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_180px_160px_160px] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск техники"
              className="w-full min-h-[44px] rounded-lg border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="min-h-[44px] rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">Все категории</option>
            {(data?.categories ?? []).map(category => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="min-h-[44px] rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value="active">Активные и просрочки</option>
            <option value="overdue">Только просрочки</option>
          </select>
          <select
            value={daysVisible}
            onChange={e => setDaysVisible(Number(e.target.value))}
            className="min-h-[44px] rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value={7}>Неделя</option>
            <option value={14}>2 недели</option>
            <option value={30}>Месяц</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: `${260 + daysVisible * 88}px` }}>
          <thead>
            <tr className="border-b bg-zinc-50">
              <th className="sticky left-0 bg-zinc-50 z-20 w-64 min-w-64 text-left px-4 py-3 font-semibold border-r text-zinc-700">
                Техника
              </th>
              {days.map(day => {
                const value = toDateString(day)
                const isToday = value === today
                const isWeekend = [0, 6].includes(day.getDay())
                return (
                  <th
                    key={value}
                    className={cn(
                      'w-[88px] min-w-[88px] py-2 font-normal text-center border-r border-zinc-100',
                      isToday && 'bg-zinc-900 text-white',
                      isWeekend && !isToday && 'bg-zinc-100 text-zinc-500'
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
              <tr>
                <td colSpan={daysVisible + 1} className="text-center py-12 text-zinc-400">
                  Загрузка календаря
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={daysVisible + 1} className="text-center py-12 text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {data && groupedEquipment.length === 0 && (
              <tr>
                <td colSpan={daysVisible + 1} className="text-center py-12 text-zinc-400">
                  Ничего не найдено
                </td>
              </tr>
            )}
            {groupedEquipment.map(group => (
              <FragmentRows
                key={group.category}
                group={group}
                days={days}
                today={today}
                profiles={data?.profiles ?? {}}
                getBooking={getBooking}
                getBlocked={getBlocked}
              />
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200" /> Активная аренда
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-100 border border-red-200" /> Просрочка
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-amber-100 border border-amber-200" /> ТО / блокировка
          </div>
        </div>
      </div>
    </div>
  )
}

function FragmentRows({
  group,
  days,
  today,
  profiles,
  getBooking,
  getBlocked,
}: {
  group: { category: string; items: Equipment[] }
  days: Date[]
  today: string
  profiles: Record<string, string>
  getBooking: (equipmentId: string, day: string) => Booking | null
  getBlocked: (equipmentId: string, day: string) => BlockedDate | null
}) {
  return (
    <>
      <tr className="bg-zinc-50/70">
        <td colSpan={days.length + 1} className="sticky left-0 z-10 px-4 py-2 text-[11px] font-semibold text-zinc-500 border-b">
          {group.category}
        </td>
      </tr>
      {group.items.map(equipment => (
        <tr key={equipment.id} className="border-b hover:bg-zinc-50/60">
          <td className="sticky left-0 bg-white z-10 px-4 py-3 border-r min-w-64">
            <Link href={`/equipment/${equipment.id}`} className="hover:text-zinc-950">
              <p className="font-medium truncate max-w-[220px] text-sm">{equipment.name}</p>
              <p className="text-zinc-400 text-xs truncate max-w-[220px]">
                {equipment.specs ?? equipment.brand ?? equipment.equipment_categories?.name ?? 'Без категории'}
              </p>
            </Link>
          </td>
          {days.map(day => {
            const value = toDateString(day)
            const booking = getBooking(equipment.id, value)
            const blocked = getBlocked(equipment.id, value)
            const order = booking?.order
            const creatorName = order?.created_by ? profiles[order.created_by] : ''
            const clientName = order?.client?.full_name ?? ''
            const isToday = value === today
            const isOverdue = order?.status === 'overdue'

            return (
              <td
                key={value}
                className={cn(
                  'border-r border-zinc-100 p-1 h-14 align-top',
                  isToday && 'ring-1 ring-inset ring-zinc-900',
                  blocked && !booking && 'bg-amber-50'
                )}
              >
                {booking && order ? (
                  <Link
                    href={`/orders/${order.id}`}
                    title={[
                      order.order_number,
                      clientName,
                      order.client?.phone,
                      creatorName ? `Оформил: ${creatorName}` : '',
                      `${order.start_date} - ${order.end_date}`,
                      booking.equipment_name,
                    ].filter(Boolean).join(' | ')}
                    className={cn(
                      'block h-full rounded-md border px-1.5 py-1 overflow-hidden transition-colors',
                      isOverdue
                        ? 'bg-red-50 border-red-200 text-red-900 hover:bg-red-100'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-950 hover:bg-emerald-100'
                    )}
                  >
                    <span className="block text-[10px] leading-tight font-semibold truncate">
                      {firstName(clientName) || 'Клиент'}
                    </span>
                    <span className="block text-[9px] leading-tight opacity-70 truncate">
                      {creatorName ? firstName(creatorName) : order.order_number}
                    </span>
                  </Link>
                ) : blocked ? (
                  <span
                    title={blocked.reason ?? 'Заблокировано'}
                    className="flex h-full items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-[10px] text-amber-800"
                  >
                    ТО
                  </span>
                ) : null}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
