'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

interface OrderItem {
  id: string
  subtotal: number
  daily_rate: number
  days: number
  condition_on_issue: string | null
  selected_kit_items: string[] | null
  equipment: { name: string } | null
}

export default function ReturnPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [items, setItems] = useState<OrderItem[]>([])
  const [returns, setReturns] = useState<Record<string, string>>({})
  // Per order_item_id: set of kit items that were returned (checked by default)
  const [returnedKit, setReturnedKit] = useState<Record<string, Set<string>>>({})
  const [actualReturnDate, setActualReturnDate] = useState('')
  const [orderEndDate, setOrderEndDate] = useState('')
  const [orderStartDate, setOrderStartDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(order => {
        const oi: OrderItem[] = order.order_items ?? []
        setItems(oi)
        setOrderEndDate(order.end_date ?? '')
        setOrderStartDate(order.start_date ?? '')
        setActualReturnDate(order.end_date ?? '')
        const initialReturns: Record<string, string> = {}
        const initialKit: Record<string, Set<string>> = {}
        oi.forEach((i) => {
          initialReturns[i.id] = 'Хорошее'
          initialKit[i.id] = new Set(i.selected_kit_items ?? [])
        })
        setReturns(initialReturns)
        setReturnedKit(initialKit)
        setLoading(false)
      })
  }, [id])

  function toggleKit(orderItemId: string, kitItem: string) {
    setReturnedKit(prev => {
      const next = { ...prev }
      const set = new Set(next[orderItemId] ?? [])
      if (set.has(kitItem)) set.delete(kitItem)
      else set.add(kitItem)
      next[orderItemId] = set
      return next
    })
  }

  // Calculate expected new total if actual_return_date differs from end_date
  const isEarlyReturn = actualReturnDate && orderEndDate && actualReturnDate < orderEndDate
  const recalcTotal = isEarlyReturn && orderStartDate
    ? (() => {
        const start = new Date(orderStartDate)
        const ret = new Date(actualReturnDate)
        const actualDays = Math.max(1, Math.round((ret.getTime() - start.getTime()) / 86400000) + 1)
        return items.reduce((sum, i) => sum + i.daily_rate * actualDays, 0)
      })()
    : null

  async function handleSubmit() {
    setSubmitting(true)
    const payload = items.map(i => {
      const original = i.selected_kit_items ?? []
      const returned = Array.from(returnedKit[i.id] ?? new Set<string>())
      const missing = original.filter(k => !returned.includes(k))
      return {
        order_item_id: i.id,
        condition_on_return: returns[i.id] ?? 'Хорошее',
        return_photo_urls: [],
        returned_kit_items: returned,
        missing_kit_items: missing,
      }
    })
    const body: Record<string, unknown> = { items: payload }
    if (actualReturnDate && actualReturnDate !== orderEndDate) {
      body.actual_return_date = actualReturnDate
    }
    const res = await fetch(`/api/orders/${id}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      toast.error('Ошибка при оформлении возврата')
    } else {
      toast.success('Возврат оформлен')
      router.push(`/orders/${id}`)
      router.refresh()
    }
    setSubmitting(false)
  }

  if (loading) return <div className="p-8 text-gray-400">Загрузка...</div>

  return (
    <div className="max-w-xl">
      <PageHeader title="Оформление возврата" />
      <div className="bg-white rounded-xl border p-6 space-y-4">
        {/* Actual return date */}
        <div className="pb-4 border-b space-y-1.5">
          <Label>Фактическая дата возврата</Label>
          <Input
            type="date"
            value={actualReturnDate}
            max={orderEndDate || undefined}
            onChange={e => setActualReturnDate(e.target.value)}
          />
          {isEarlyReturn && recalcTotal !== null && (
            <p className="text-xs text-amber-600 font-medium">
              ⚡ Досрочный возврат — сумма пересчитается: {recalcTotal.toLocaleString('ru-RU')} сум
            </p>
          )}
        </div>

        {items.map(item => {
          const kit = item.selected_kit_items ?? []
          const returned = returnedKit[item.id] ?? new Set<string>()
          const missingCount = kit.length - returned.size
          return (
            <div key={item.id} className="border-b pb-4 last:border-0">
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium text-sm">{item.equipment?.name}</p>
                <span className="text-xs text-gray-500">{formatCurrency(item.subtotal)}</span>
              </div>
              {item.condition_on_issue && (
                <p className="text-xs text-gray-400 mb-2">При выдаче: {item.condition_on_issue}</p>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Состояние при возврате</Label>
                <Textarea
                  rows={2}
                  value={returns[item.id] ?? ''}
                  onChange={e => setReturns(r => ({ ...r, [item.id]: e.target.value }))}
                  placeholder="Хорошее / царапины / требует ремонта..."
                />
              </div>

              {kit.length > 0 && (
                <div className="mt-3 rounded-lg border bg-zinc-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs">Комплектация</Label>
                    <span className={`text-[11px] font-medium ${missingCount > 0 ? 'text-amber-600' : 'text-zinc-500'}`}>
                      {missingCount > 0
                        ? `Не возвращено: ${missingCount} из ${kit.length}`
                        : `Все на месте (${kit.length})`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {kit.map(kitItem => {
                      const isReturned = returned.has(kitItem)
                      return (
                        <button
                          key={kitItem}
                          type="button"
                          onClick={() => toggleKit(item.id, kitItem)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            isReturned
                              ? 'border-zinc-900 bg-zinc-900 text-white'
                              : 'border-amber-300 bg-amber-50 text-amber-700 line-through'
                          }`}
                        >
                          {kitItem}
                        </button>
                      )
                    })}
                  </div>
                  {missingCount > 0 && (
                    <p className="mt-2 text-[11px] text-amber-700">
                      ⚠ Отмеченные позиции будут зафиксированы как невозвращённые. Заказ всё равно закроется.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Оформляем...' : 'Подтвердить возврат'}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>Отмена</Button>
        </div>
      </div>
    </div>
  )
}
