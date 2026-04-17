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
    created_by: string | null
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

export default function CalendarPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 2)
    return d
  })
  const [data, setData] = useState<{
    equipment: Equipment[]
    bookings: Booking[]
    blocked: BlockedDate[]
    profiles: Record<string, string>
  } | null>(null)

  const endDate = addDays(startDate, DAYS_VISIBLE - 1)

  useEffect(() => {
    setData(null)
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

  const profiles = data?.profiles ?? {}

  return (
    <div>
      <PageHeader
        title="Календарь бронирований"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => setStartDate(d => addDays(d, -DAYS_VISIBLE))}
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
              onClick={() => setStartDate(d => addDays(d, DAYS_VISIBLE))}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        }
      />

      <div className="bg-white rounded-2xl border overflow-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: `${220 + DAYS_VISIBLE * 38}px` }}>
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="sticky left-0 bg-gray-50 z-10 w-52 min-w-[13rem] text-left px-4 py-3 font-semibold border-r text-gray-700">
                Техника
              </th>
              {days.map(d => {
                const str = toStr(d)
                const isToday = str === today
                const dow = d.getDay()
                const isWeekend = dow === 0 || dow === 6
                return (
                  <th key={str} className={cn(
                    'w-10 min-w-[38px] py-2 font-normal text-center border-r border-gray-100',
                    isToday && 'bg-blue-50 text-blue-700 font-bold',
                    isWeekend && !isToday && 'bg-gray-100 text-gray-400'
                  )}>
                    <div className="text-sm">{d.getDate()}</div>
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
                <td className="sticky left-0 bg-white z-10 px-4 py-3 border-r min-w-[13rem]">
                  <Link href={`/equipment/${eq.id}`} className="hover:text-blue-600">
                    <p className="font-medium truncate max-w-[170px] text-sm">{eq.name}</p>
                    <p className="text-gray-400 text-xs">{eq.equipment_categories?.name ?? '—'}</p>
                  </Link>
                </td>
                {days.map(d => {
                  const str = toStr(d)
                  const bookings = getBookingsFor(eq.id, str)
                  const blocked = getBlockedFor(eq.id, str)
                  const isToday = str === today
                  const booking = bookings[0]
                  const order = booking?.orders

                  // Only show label on the start day of a booking
                  const isStartDay = order && order.start_date === str

                  const bg = blocked.length > 0 ? 'bg-orange-200' :
                    bookings.length > 0
                      ? order?.status === 'overdue' ? 'bg-red-200' : 'bg-blue-200'
                      : ''

                  const creatorName = order?.created_by ? (profiles[order.created_by] ?? '') : ''

                  return (
                    <td key={str} className={cn(
                      'border-r border-gray-100 text-center p-0 h-11 relative',
                      isToday && 'border-x-2 border-blue-300',
                      bg
                    )}>
                      {order ? (
                        <Link
                          href={`/orders/${order.id}`}
                          title={[
                            order.order_number,
                            order.clients?.full_name,
                            creatorName ? `(${creatorName})` : '',
                          ].filter(Boolean).join(' — ')}
                          className="block w-full h-full"
                        >
                          {isStartDay && (
                            <span className="absolute inset-y-0 left-0.5 right-0.5 flex flex-col justify-center px-1 overflow-hidden pointer-events-none">
                              <span className="text-[9px] font-semibold text-blue-900 truncate leading-tight">
                                {order.clients?.full_name?.split(' ')[0]}
                              </span>
                              {creatorName && (
                                <span className="text-[8px] text-blue-700/70 truncate leading-tight">
                                  {creatorName.split(' ')[0]}
                                </span>
                              )}
                            </span>
                          )}
                        </Link>
                      ) : blocked.length > 0 ? (
                        <span title={blocked[0].reason ?? 'Заблокировано'} className="block w-full h-full" />
                      ) : null}
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
            {data && data.equipment.length === 0 && (
              <tr>
                <td colSpan={DAYS_VISIBLE + 1} className="text-center py-12 text-gray-400">
                  Нет техники
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-200" /> В аренде (имя клиента / администратор)
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-200" /> Просрочена
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-200" /> Заблокировано / ТО
          </div>
        </div>
      </div>
    </div>
  )
}
