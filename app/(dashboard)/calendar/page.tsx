'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface Equipment {
  id: string
  name: string
  status: string
  equipment_categories: { name: string } | null
}

interface Booking {
  equipment_id: string
  orders: {
    id: string
    order_number: string
    start_date: string
    end_date: string
    status: string
    clients: { full_name: string } | null
  } | null
}

interface BlockedDate {
  id: string
  equipment_id: string
  start_date: string
  end_date: string
  reason: string | null
}

const DAYS_VISIBLE = 30

function addDays(date: Date, n: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export default function CalendarPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 2)
    return d
  })
  const [data, setData] = useState<{ equipment: Equipment[]; bookings: Booking[]; blocked: BlockedDate[] } | null>(null)

  const endDate = addDays(startDate, DAYS_VISIBLE - 1)

  useEffect(() => {
    fetch(`/api/calendar?from=${toStr(startDate)}&to=${toStr(endDate)}`)
      .then(r => r.json())
      .then(setData)
  }, [startDate])

  const days = Array.from({ length: DAYS_VISIBLE }, (_, i) => addDays(startDate, i))
  const today = toStr(new Date())

  function getBookingsFor(equipmentId: string, day: string) {
    if (!data) return []
    return (data.bookings ?? []).filter(b =>
      b.equipment_id === equipmentId &&
      b.orders &&
      b.orders.start_date <= day &&
      b.orders.end_date >= day
    )
  }

  function getBlockedFor(equipmentId: string, day: string) {
    if (!data) return []
    return (data.blocked ?? []).filter(b =>
      b.equipment_id === equipmentId &&
      b.start_date <= day &&
      b.end_date >= day
    )
  }

  return (
    <div>
      <PageHeader
        title="Календарь бронирований"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStartDate(d => addDays(d, -DAYS_VISIBLE))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStartDate(new Date())}>
              Сегодня
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStartDate(d => addDays(d, DAYS_VISIBLE))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <div className="bg-white rounded-xl border overflow-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: `${200 + DAYS_VISIBLE * 36}px` }}>
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 bg-white z-10 w-48 min-w-[12rem] text-left px-4 py-2 font-semibold border-r">
                Техника
              </th>
              {days.map(d => {
                const str = toStr(d)
                const isToday = str === today
                const dow = d.getDay()
                const isWeekend = dow === 0 || dow === 6
                return (
                  <th key={str} className={cn(
                    'w-9 min-w-[36px] py-2 font-normal text-center border-r border-gray-100',
                    isToday && 'bg-blue-50 text-blue-700 font-bold',
                    isWeekend && !isToday && 'bg-gray-50 text-gray-400'
                  )}>
                    <div>{d.getDate()}</div>
                    <div className="text-[10px] text-gray-400">
                      {d.toLocaleDateString('ru', { weekday: 'short' })}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {(data?.equipment ?? []).map(eq => (
              <tr key={eq.id} className="border-b hover:bg-gray-50/50">
                <td className="sticky left-0 bg-white z-10 px-4 py-2 border-r">
                  <Link href={`/equipment/${eq.id}`} className="hover:text-blue-600">
                    <p className="font-medium truncate max-w-[160px]">{eq.name}</p>
                    <p className="text-gray-400">{eq.equipment_categories?.name ?? '—'}</p>
                  </Link>
                </td>
                {days.map(d => {
                  const str = toStr(d)
                  const bookings = getBookingsFor(eq.id, str)
                  const blocked = getBlockedFor(eq.id, str)
                  const isToday = str === today

                  const bg = blocked.length > 0 ? 'bg-orange-200' :
                    bookings.length > 0
                      ? bookings[0].orders?.status === 'overdue' ? 'bg-red-300' : 'bg-blue-300'
                      : ''

                  return (
                    <td key={str} className={cn(
                      'border-r border-gray-100 text-center p-0 h-10',
                      isToday && 'border-x-2 border-blue-300',
                      bg
                    )}>
                      {bookings[0]?.orders && (
                        <Link
                          href={`/orders/${bookings[0].orders.id}`}
                          title={`${bookings[0].orders.order_number} — ${bookings[0].orders.clients?.full_name}`}
                          className="block w-full h-full"
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {!data && (
              <tr>
                <td colSpan={DAYS_VISIBLE + 1} className="text-center py-12 text-gray-400">
                  Загрузка...
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Legend */}
        <div className="flex items-center gap-6 px-4 py-3 border-t text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-300" /> В аренде
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-300" /> Просрочена
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-200" /> Заблокировано / ТО
          </div>
        </div>
      </div>
    </div>
  )
}
