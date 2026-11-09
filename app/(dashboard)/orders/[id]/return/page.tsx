'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { formatCurrency, getTashkentDate, getTashkentTime } from '@/lib/utils'
import { normalizeOrder } from '@/lib/orders/list'
import { useOrderOperation } from '@/components/orders/useOrderOperation'
import { OperationNotice } from '@/components/orders/OperationNotice'
import { buildTashkentDate } from '@/lib/billing'

interface OrderItem {
  id: string
  subtotal: number
  daily_rate: number
  days: number
  returned?: boolean
  actual_start_at?: string | null
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
  // Per order_item_id: set of kit items explicitly marked as returned.
  const [returnedKit, setReturnedKit] = useState<Record<string, Set<string>>>({})
  const [actualReturnDate, setActualReturnDate] = useState('')
  const [actualReturnTime, setActualReturnTime] = useState('')
  const [orderEndDate, setOrderEndDate] = useState('')
  const [orderStartDate, setOrderStartDate] = useState('')
  const [orderActualStartAt, setOrderActualStartAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const operation = useOrderOperation(id)
  const submitting = operation.pending
  const [order, setOrder] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/orders/${id}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить заказ. Проверьте ссылку и соединение.')
        return response.json()
      })
      .then(order => {
        setOrder(order)
        const oi: OrderItem[] = (order.order_items ?? []).filter((item: OrderItem) => !item.returned)
        setItems(oi)
        setOrderEndDate(order.end_date ?? '')
        setOrderStartDate(order.start_date ?? '')
        setOrderActualStartAt(order.actual_start_at ?? null)
        setActualReturnDate(getTashkentDate())
        setActualReturnTime(getTashkentTime())
        const initialReturns: Record<string, string> = {}
        const initialKit: Record<string, Set<string>> = {}
        oi.forEach((i) => {
          initialReturns[i.id] = 'Хорошее'
          initialKit[i.id] = new Set(i.selected_kit_items ?? [])
        })
        setReturns(initialReturns)
        setReturnedKit(initialKit)
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message || 'Не удалось загрузить заказ') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, reloadKey])

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

  const actualReturnAt = actualReturnDate && actualReturnTime
    ? buildTashkentDate(actualReturnDate, actualReturnTime)
    : null
  const startAt = orderActualStartAt
    ? new Date(orderActualStartAt)
    : orderStartDate
      ? buildTashkentDate(orderStartDate, '09:30')
      : null
  const latestStart = Math.max(startAt?.getTime() ?? 0, ...items.map(item => item.actual_start_at ? Date.parse(item.actual_start_at) : 0))
  const validReturnTime = Boolean(actualReturnAt && Number.isFinite(actualReturnAt.getTime()) && actualReturnAt.getTime() >= latestStart)
  const returnPreview = order && actualReturnAt && validReturnTime
    ? normalizeOrder(order, 0, actualReturnAt)
    : null
  const recalcTotal = returnPreview?.effectiveTotal ?? null
  const canReturn = order && ['active', 'overdue'].includes(String(order.status)) && items.length > 0

  async function handleSubmit() {
    if (submitting || operation.uncertain || !canReturn || !validReturnTime) return
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
    if (actualReturnAt) {
      body.actual_end_at = actualReturnAt.toISOString()
    }
    if (await operation.submit(`/api/orders/${id}/return`, body)) {
      toast.success('Возврат оформлен')
      router.push(`/orders/${id}`)
      router.refresh()
    }
  }

  if (loading) return <div className="p-8 text-zinc-400">Загрузка...</div>

  if (error) return <div role="alert" className="space-y-3 rounded-2xl border bg-white p-6"><p>{error}</p><Button onClick={() => setReloadKey(value => value + 1)}>Повторить загрузку</Button></div>
  if (!canReturn) return <div className="space-y-3 rounded-2xl border bg-white p-6"><p>У этого заказа нет техники к возврату.</p><Button variant="outline" onClick={() => router.push(`/orders/${id}`)}>Открыть заказ</Button></div>

  return (
    <div className="max-w-xl">
      <PageHeader title="Оформление возврата" />
      <OperationNotice orderId={id} message={operation.message} uncertain={operation.uncertain} onChecked={operation.acknowledgeNotSaved} />
      <fieldset disabled={submitting || operation.uncertain} className="min-w-0 bg-white rounded-2xl border p-6 space-y-4">
        {/* Actual return date */}
        <div className="pb-4 border-b space-y-2">
          <Label>Фактическое время возврата</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="Фактическая дата возврата"
              type="date"
              value={actualReturnDate}
              onChange={e => setActualReturnDate(e.target.value)}
            />
            <Input
              aria-label="Фактическое время возврата"
              type="time"
              value={actualReturnTime}
              onChange={e => setActualReturnTime(e.target.value)}
            />
          </div>
          {!validReturnTime && <p role="alert" className="text-sm text-red-700">Укажите время возврата не раньше выдачи всех выбранных позиций.</p>}
          {recalcTotal !== null && (
            <p className="text-xs text-amber-600 font-medium">
              Итог заказа по правилам смен, включая доставку: {recalcTotal.toLocaleString('ru-RU')} сум
            </p>
          )}
          {orderEndDate && (
            <p className="text-xs text-zinc-500">Плановая дата возврата: {orderEndDate}</p>
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
                <span className="text-xs text-zinc-500">{formatCurrency(returnPreview?.closeItems.find(row => row.id === item.id)?.current_subtotal ?? item.subtotal)}</span>
              </div>
              {item.condition_on_issue && (
                <p className="text-xs text-zinc-400 mb-2">При выдаче: {item.condition_on_issue}</p>
              )}
              <div className="space-y-1">
                <Label htmlFor={`return-condition-${item.id}`} className="text-xs">Состояние при возврате</Label>
                <Textarea id={`return-condition-${item.id}`}
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
                    <span className={`text-xs font-medium ${missingCount > 0 ? 'text-orange-700' : 'text-zinc-500'}`}>
                      {missingCount > 0
                        ? `Не сдано: ${missingCount} из ${kit.length}`
                        : `Все сдано (${kit.length})`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {kit.map(kitItem => {
                      const isReturned = returned.has(kitItem)
                      return (
                        <button
                          key={kitItem}
                          type="button"
                          aria-pressed={isReturned}
                          onClick={() => toggleKit(item.id, kitItem)}
                          className={`min-h-11 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            isReturned
                              ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
                              : 'border-orange-500 bg-orange-500 text-white shadow-sm hover:border-orange-600 hover:bg-orange-600'
                          }`}
                        >
                          {isReturned ? '✓ Возвращено: ' : 'Не возвращено: '}{kitItem}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Проверьте каждый аксессуар. По умолчанию комплект отмечен как возвращённый; отсутствующие элементы отметьте «Не возвращено».
                  </p>
                </div>
              )}
            </div>
          )
        })}

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSubmit} disabled={submitting || operation.uncertain || !validReturnTime}>
            {submitting ? 'Оформляем...' : 'Подтвердить возврат'}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>Отмена</Button>
        </div>
      </fieldset>
    </div>
  )
}
