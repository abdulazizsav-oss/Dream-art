'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useOrderOperation } from './useOrderOperation'
import { OperationNotice } from './OperationNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PackageCheck, Plus, Trash2 } from 'lucide-react'
import { PAYMENT_METHOD_LABELS, cn, formatCurrency } from '@/lib/utils'

type PaymentMethod = 'cash' | 'transfer' | 'card'
type PaymentIntent = 'paid' | 'unpaid'

interface Split {
  method: PaymentMethod
  amount: string
}

interface PartialItem {
  id: string
  name: string
  selected_kit_items: string[]
  current_subtotal: number
  already_paid: number
  currency?: 'UZS' | 'USD'
}

interface Props {
  orderId: string
  items: PartialItem[]
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

/**
 * «Вернуть часть техники» — выбираем, какие позиции заказа сейчас возвращаются.
 * Сумма по сданным позициям замораживается на сервере (computeActiveOrderTotal).
 * Заказ остаётся активным, пока остаются несданные позиции.
 */
export function PartialReturnModal({ orderId, items, variant = 'outline', size = 'default', className }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const operation = useOrderOperation(orderId)
  const loading = operation.pending

  // Какие позиции сдаём (по умолчанию ничего — пользователь выбирает явно)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [paymentIntent, setPaymentIntent] = useState<Record<string, PaymentIntent>>({})
  const [splits, setSplits] = useState<Split[]>([{ method: 'cash', amount: '' }])
  const [notes, setNotes] = useState('')
  const [conditions, setConditions] = useState<Record<string, string>>({})

  // Комплект: по умолчанию весь комплект считается возвращённым —
  // менеджер снимает отметку только с того, что НЕ вернули.
  const [returnedKit, setReturnedKit] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {}
    for (const it of items) init[it.id] = new Set(it.selected_kit_items)
    return init
  })

  function toggleItem(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        setPaymentIntent(intent => ({ ...intent, [id]: intent[id] ?? 'paid' }))
      }
      return next
    })
  }

  function setItemPaymentIntent(id: string, intent: PaymentIntent) {
    setPaymentIntent(prev => ({ ...prev, [id]: intent }))
  }

  function toggleKit(itemId: string, kit: string) {
    setReturnedKit(prev => {
      const next = { ...prev }
      const s = new Set(next[itemId] ?? [])
      if (s.has(kit)) s.delete(kit); else s.add(kit)
      next[itemId] = s
      return next
    })
  }

  const missingTotals = useMemo(() => {
    let total = 0
    for (const id of picked) {
      const src = items.find(it => it.id === id)
      if (!src) continue
      const ret = returnedKit[id] ?? new Set<string>()
      total += src.selected_kit_items.filter(k => !ret.has(k)).length
    }
    return total
  }, [items, picked, returnedKit])

  const selectedSubtotal = useMemo(() => {
    let total = 0
    for (const id of picked) {
      total += items.find(it => it.id === id)?.current_subtotal ?? 0
    }
    return total
  }, [items, picked])

  const paidTotal = useMemo(() => {
    let total = 0
    for (const id of picked) {
      if ((paymentIntent[id] ?? 'paid') === 'paid') {
        const item = items.find(it => it.id === id)
        if (!item) continue
        total += Math.max(0, item.current_subtotal - item.already_paid)
      }
    }
    return total
  }, [items, paymentIntent, picked])

  const splitTotal = useMemo(
    () => splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0),
    [splits],
  )
  const splitMismatch = Math.abs(splitTotal - paidTotal) > 0.01

  useEffect(() => {
    setSplits(prev => {
      if (prev.length !== 1) return prev
      return [{ ...prev[0], amount: paidTotal > 0 ? String(Math.round(paidTotal)) : '' }]
    })
  }, [paidTotal])

  function updateSplit(index: number, patch: Partial<Split>) {
    setSplits(prev => prev.map((split, i) => (i === index ? { ...split, ...patch } : split)))
  }

  function addSplit() {
    const used = new Set(splits.map(split => split.method))
    const next = (['cash', 'card', 'transfer'] as PaymentMethod[]).find(method => !used.has(method)) ?? 'card'
    setSplits(prev => [...prev, { method: next, amount: '' }])
  }

  function removeSplit(index: number) {
    setSplits(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading || operation.uncertain) return
    if (picked.size === 0) {
      toast.error('Выберите хотя бы одну позицию')
      return
    }
    if (paidTotal > 0 && splitMismatch) {
      toast.error('Сумма способов оплаты должна совпадать с оплачиваемыми позициями')
      return
    }
    {
      const paymentSplits = paidTotal > 0
        ? splits
            .map(split => ({ payment_method: split.method, amount: Number(split.amount) }))
            .filter(split => split.amount > 0)
        : []

      const payload = {
        items: Array.from(picked).map(id => {
          const src = items.find(it => it.id === id)!
          const returned = Array.from(returnedKit[id] ?? new Set<string>())
          const missing = src.selected_kit_items.filter(k => !returned.includes(k))
          return {
            order_item_id: id,
            condition_on_return: conditions[id]?.trim() || 'Хорошее',
            return_photo_urls: [],
            returned_kit_items: returned,
            missing_kit_items: missing,
            payment_intent: paymentIntent[id] ?? 'paid',
          }
        }),
        payment_splits: paymentSplits,
        payment_notes: notes || null,
      }

      if (!await operation.submit(`/api/orders/${orderId}/return`, payload)) return
      toast.success('Возврат записан. Сданные позиции зафиксированы.')

      setOpen(false)
      router.refresh()
    }
  }

  if (items.length < 2) return null

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <PackageCheck className="w-4 h-4 mr-2" />
        Вернуть часть техники
      </Button>
      <Dialog open={open} onOpenChange={value => { if (!loading) setOpen(value) }}>
        <DialogContent showCloseButton={!loading} className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="pr-10">
            <DialogTitle>Частичный возврат техники</DialogTitle>
            <DialogDescription>
              Отметьте позиции, которые клиент возвращает сейчас. Сумма по ним зафиксируется от фактического открытия до текущего времени. Остальные продолжат считаться.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
            <OperationNotice orderId={orderId} message={operation.message} uncertain={operation.uncertain} onChecked={operation.acknowledgeNotSaved} />
            <fieldset disabled={loading || operation.uncertain} className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Возвращаем сейчас</p>
                <p className="mt-1 font-semibold tabular-nums">{formatCurrency(selectedSubtotal)}</p>
              </div>
              <div className="rounded-xl border bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">К оплате сейчас</p>
                <p className="mt-1 font-semibold text-emerald-800 tabular-nums">{formatCurrency(paidTotal)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Позиции к сдаче</Label>
              <p className="text-xs text-zinc-500">«Оплачено» включает остаток позиции в сумму оплаты сейчас. «Не оплачено» оставляет её долгом.</p>
              <div className="space-y-2 rounded-xl border bg-zinc-50/60 p-2">
                {items.map(it => {
                  const active = picked.has(it.id)
                  const returned = returnedKit[it.id] ?? new Set<string>()
                  const intent = paymentIntent[it.id] ?? 'paid'
                  const remainingDue = Math.max(0, it.current_subtotal - it.already_paid)
                  return (
                    <div key={it.id} className={cn('rounded-lg border p-2 transition-colors', active ? 'bg-white border-emerald-400' : 'bg-white')}>
                      <label className="flex min-h-11 items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleItem(it.id)}
                          className="mt-1"
                        />
                        <span className="flex-1 text-sm font-medium text-gray-800">{it.name}</span>
                        <span className="text-xs font-semibold tabular-nums text-gray-700">
                          {formatCurrency(it.current_subtotal, it.currency)}
                        </span>
                      </label>
                      {active && it.already_paid > 0 && (
                        <p className="mt-1 pl-6 text-xs text-zinc-500">
                          Уже оплачено: {formatCurrency(it.already_paid, it.currency)} · остаток: {formatCurrency(remainingDue, it.currency)}
                        </p>
                      )}
                      {active && (
                        <div className="mt-2 pl-6 flex flex-wrap gap-1.5">
                          {(['paid', 'unpaid'] as PaymentIntent[]).map(nextIntent => (
                            <button
                              key={nextIntent}
                              type="button"
                              aria-pressed={intent === nextIntent}
                              onClick={() => setItemPaymentIntent(it.id, nextIntent)}
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors min-h-[44px]',
                                intent === nextIntent
                                  ? nextIntent === 'paid'
                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                    : 'border-amber-600 bg-amber-600 text-white'
                                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
                              )}
                            >
                              {nextIntent === 'paid' ? 'Оплачено' : 'Не оплачено'}
                            </button>
                          ))}
                        </div>
                      )}
                      {active && <details className="mt-2 border-t pt-2">
                        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Состояние при возврате: {conditions[it.id] || 'Хорошее'}</summary>
                        <Input aria-label={`Состояние при возврате: ${it.name}`} value={conditions[it.id] ?? 'Хорошее'} onChange={event => setConditions(current => ({ ...current, [it.id]: event.target.value }))} />
                      </details>}
                      {active && it.selected_kit_items.length > 0 && (
                        <div className="mt-2 pl-6 flex flex-wrap gap-1.5">
                          {it.selected_kit_items.map(k => {
                            const ok = returned.has(k)
                            return (
                              <button
                                key={k}
                                type="button"
                                aria-pressed={ok}
                                onClick={() => toggleKit(it.id, k)}
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors min-h-[44px]',
                                  ok
                                    ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
                                    : 'border-orange-500 bg-orange-500 text-white shadow-sm hover:border-orange-600 hover:bg-orange-600',
                                )}
                              >
                                {ok ? '✓ Возвращено: ' : 'Не возвращено: '}{k}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {missingTotals > 0 && (
                <p className="text-xs font-medium text-orange-700">
                  Не сдано элементов комплекта: {missingTotals}. {items.filter(item => picked.has(item.id)).flatMap(item => item.selected_kit_items.filter(kit => !returnedKit[item.id]?.has(kit)).map(kit => `${item.name}: ${kit}`)).join('; ')}
                </p>
              )}
              <p className="text-xs text-gray-500">
                Аксессуары по умолчанию отмечены как возвращённые. Нажмите на то, чего нет: появится «Не возвращено».
              </p>
            </div>

            {paidTotal > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Способы оплаты</Label>
                  <span className="text-xs text-zinc-500">
                    {splits.length > 1 ? 'Сплит-платёж' : 'Один способ'}
                  </span>
                </div>

                <div className="space-y-2">
                  {splits.map((split, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border bg-zinc-50/60 p-2">
                      <div className="flex w-full flex-wrap gap-1 sm:w-auto">
                        {(['cash', 'card', 'transfer'] as PaymentMethod[]).map(method => (
                          <button
                            key={method}
                            type="button"
                            aria-pressed={split.method === method}
                            onClick={() => updateSplit(index, { method })}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors min-h-[44px]',
                              split.method === method
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
                            )}
                          >
                            {PAYMENT_METHOD_LABELS[method]}
                          </button>
                        ))}
                      </div>
                      <Input
                        aria-label={`Сумма: ${PAYMENT_METHOD_LABELS[split.method]}, строка ${index + 1}`}
                      type="number"
                        inputMode="numeric"
                        min={0}
                        value={split.amount}
                        onChange={e => updateSplit(index, { amount: e.target.value })}
                        placeholder="0"
                        className="flex-1 min-h-[44px]"
                      />
                      {splits.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSplit(index)}
                          className="min-h-11 min-w-11 rounded-full p-2 text-zinc-400 hover:bg-white hover:text-red-500 transition-colors"
                          aria-label="Удалить способ"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {splits.length < 3 && (
                  <Button type="button" variant="outline" size="sm" onClick={addSplit} className="min-h-[44px]">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Добавить способ
                  </Button>
                )}

                <div className="flex justify-between items-center rounded-lg bg-zinc-100 px-3 py-2 text-sm">
                  <span className="text-zinc-600">Сумма оплат</span>
                  <span className={cn('font-semibold tabular-nums', splitMismatch ? 'text-red-600' : 'text-emerald-700')}>
                    {formatCurrency(splitTotal)}
                  </span>
                </div>

                {splitMismatch && (
                  <p className="text-xs font-medium text-red-600">
                    Нужно ровно {formatCurrency(paidTotal)} по выбранным оплаченным позициям.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`notes-PartialReturnModal-${orderId}`}>Заметка к оплате</Label>
              <Textarea
              id={`notes-PartialReturnModal-${orderId}`}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Напр. «частично сдал и оплатил наличкой»"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" disabled={loading || picked.size === 0 || (paidTotal > 0 && splitMismatch)}>
                {loading ? 'Фиксируем...' : `Вернуть ${picked.size} позиц${picked.size === 1 ? 'ию' : picked.size < 5 ? 'ии' : 'ий'}`}
              </Button>
            </DialogFooter>
          </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
