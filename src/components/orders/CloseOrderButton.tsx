'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle, Plus, Trash2 } from 'lucide-react'
import { PAYMENT_METHOD_LABELS, formatCurrency, cn } from '@/lib/utils'
import { DELIVERY_SERVICE_FEE } from '@/lib/delivery'

type PaymentMethod = 'cash' | 'transfer' | 'card'

interface CloseOrderItem {
  id: string
  name: string
  selected_kit_items: string[]
  current_subtotal: number
  currency?: 'UZS' | 'USD'
}

interface CloseOrderButtonProps {
  orderId: string
  debt: number
  items?: CloseOrderItem[]
  deliveryFee?: number
  deliveryPaid?: number
  deliveryToClient?: boolean
  deliveryFromClient?: boolean
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

interface Split {
  method: PaymentMethod
  amount: string
}

export function CloseOrderButton({
  orderId,
  debt,
  items = [],
  deliveryFee = 0,
  deliveryPaid = 0,
  deliveryToClient = false,
  deliveryFromClient = false,
  variant = 'default',
  size = 'default',
  className,
}: CloseOrderButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const initialAmount = debt > 0 ? String(debt) : ''
  const [splits, setSplits] = useState<Split[]>([{ method: 'cash', amount: initialAmount }])
  const [notes, setNotes] = useState('')
  const [leaveDebt, setLeaveDebt] = useState(false)
  const [toClient, setToClient] = useState(deliveryToClient)
  const [fromClient, setFromClient] = useState(deliveryFromClient)

  // Kit tracking: по умолчанию считаем, что вернулся весь комплект —
  // менеджер снимает отметку только с того, что НЕ вернули (забытая батарейка).
  const [returnedKit, setReturnedKit] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {}
    for (const it of items) init[it.id] = new Set(it.selected_kit_items)
    return init
  })

  const paidNow = useMemo(
    () => splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0),
    [splits],
  )
  const closingItemsTotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.current_subtotal) || 0), 0),
    [items],
  )
  const additionalDeliveryFee = (
    (!deliveryToClient && toClient ? DELIVERY_SERVICE_FEE : 0)
    + (!deliveryFromClient && fromClient ? DELIVERY_SERVICE_FEE : 0)
  )
  const closingDeliveryFee = deliveryFee + additionalDeliveryFee
  const closingDebt = debt + additionalDeliveryFee
  const deliveryRemaining = Math.max(0, closingDeliveryFee - deliveryPaid)
  const remainingDebt = Math.max(0, closingDebt - paidNow)
  const paymentIsTooLarge = paidNow > closingDebt + 0.01

  const missingTotals = useMemo(() => {
    let total = 0
    const byItem: Record<string, string[]> = {}
    for (const it of items) {
      const ret = returnedKit[it.id] ?? new Set<string>()
      const miss = it.selected_kit_items.filter(k => !ret.has(k))
      byItem[it.id] = miss
      total += miss.length
    }
    return { total, byItem }
  }, [items, returnedKit])

  function toggleKit(itemId: string, kit: string) {
    setReturnedKit(prev => {
      const next = { ...prev }
      const s = new Set(next[itemId] ?? [])
      if (s.has(kit)) s.delete(kit)
      else s.add(kit)
      next[itemId] = s
      return next
    })
  }

  function updateSplit(i: number, patch: Partial<Split>) {
    setSplits(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function selectPaymentMethod(i: number, method: PaymentMethod) {
    const wasDebt = leaveDebt
    setLeaveDebt(false)
    setSplits(prev => prev.map((split, idx) => (
      idx === i
        ? {
            ...split,
            method,
            amount: wasDebt && i === 0 && closingDebt > 0 ? String(closingDebt) : split.amount,
          }
        : split
    )))
  }

  function selectDebt() {
    setLeaveDebt(true)
    setSplits([{ method: 'cash', amount: '' }])
  }

  function toggleDelivery(direction: 'to' | 'from') {
    const locked = direction === 'to' ? deliveryToClient : deliveryFromClient
    if (locked) return

    const wasActive = direction === 'to' ? toClient : fromClient
    const delta = wasActive ? -DELIVERY_SERVICE_FEE : DELIVERY_SERVICE_FEE
    const previousDebt = closingDebt

    if (direction === 'to') setToClient(!wasActive)
    else setFromClient(!wasActive)

    if (!leaveDebt) {
      setSplits(current => {
        if (current.length !== 1 || Number(current[0].amount) !== previousDebt) return current
        return [{ ...current[0], amount: String(Math.max(0, previousDebt + delta)) }]
      })
    }
  }

  function addSplit() {
    const used = new Set(splits.map(s => s.method))
    const next = (['cash', 'card', 'transfer'] as PaymentMethod[]).find(m => !used.has(m)) ?? 'card'
    setSplits(prev => [...prev, { method: next, amount: '' }])
  }
  function removeSplit(i: number) {
    setSplits(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const validSplits = splits
        .map(s => ({ payment_method: s.method, amount: Number(s.amount) }))
        .filter(s => s.amount > 0)

      if (paymentIsTooLarge) {
        toast.error('Сумма оплаты больше остатка по заказу')
        setLoading(false)
        return
      }

      let remainingPaidForItems = paidNow
      const returnItems = items.map(it => {
        const returned = Array.from(returnedKit[it.id] ?? new Set<string>())
        const missing = it.selected_kit_items.filter(k => !returned.includes(k))
        const paidAmount = Math.min(it.current_subtotal, Math.max(remainingPaidForItems, 0))
        remainingPaidForItems -= paidAmount
        return {
          order_item_id: it.id,
          condition_on_return: 'Хорошее',
          return_photo_urls: [],
          returned_kit_items: returned,
          missing_kit_items: missing,
          paid_amount: paidAmount,
        }
      })

      const closeRes = await fetch(`/api/orders/${orderId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: returnItems,
          payment_splits: validSplits,
          payment_notes: notes || null,
          delivery_to_client: toClient,
          delivery_from_client: fromClient,
        }),
      })
      if (!closeRes.ok) {
        const err = await closeRes.json().catch(() => ({}))
        toast.error(err.error ?? 'Ошибка закрытия заказа')
        setLoading(false)
        return
      }

      if (missingTotals.total > 0 && remainingDebt > 0) {
        toast.success(
          `Заказ закрыт. Долг: ${formatCurrency(remainingDebt)}. Не возвращено позиций комплекта: ${missingTotals.total}`,
        )
      } else if (missingTotals.total > 0) {
        toast.success(`Заказ закрыт. Не возвращено позиций комплекта: ${missingTotals.total}`)
      } else if (remainingDebt > 0 && leaveDebt) {
        toast.success(`Заказ закрыт. Остался долг: ${formatCurrency(remainingDebt)}`)
      } else if (remainingDebt > 0) {
        toast.success(`Заказ закрыт. Долг: ${formatCurrency(remainingDebt)}`)
      } else {
        toast.success('Заказ закрыт. Оплата получена полностью.')
      }

      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const hasKit = items.some(it => it.selected_kit_items.length > 0)

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <CheckCircle className="w-4 h-4 mr-2" />
        Закрыть заказ
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
          <DialogTitle>Закрытие заказа</DialogTitle>
          <DialogDescription>
            Отметим, что вернулось из комплекта, выберем оплату или долг и закроем заказ.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border bg-gray-50 p-3 flex justify-between text-sm">
            <span className="text-gray-600">Задолженность по заказу</span>
            <span className={debt > 0 ? 'font-semibold text-red-600' : 'font-semibold text-green-700'}>
              {formatCurrency(Math.max(0, closingDebt))}
            </span>
          </div>
          <div className="rounded-xl border bg-gray-50 p-3 flex justify-between text-sm">
            <span className="text-gray-600">Сумма закрываемых позиций</span>
            <span className="font-semibold text-gray-900">
              {formatCurrency(Math.max(0, closingItemsTotal))}
            </span>
          </div>
          <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-sky-800">Услуги доставки</p>
                <p className="text-[11px] text-sky-600">Можно добавить забытый выезд перед закрытием.</p>
              </div>
              <span className="text-sm font-semibold text-sky-900">{formatCurrency(deliveryRemaining)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <DeliveryCloseToggle
                active={toClient}
                locked={deliveryToClient}
                onClick={() => toggleDelivery('to')}
                icon={<ArrowUpFromLine className="h-4 w-4" />}
                label="Отправить клиенту"
              />
              <DeliveryCloseToggle
                active={fromClient}
                locked={deliveryFromClient}
                onClick={() => toggleDelivery('from')}
                icon={<ArrowDownToLine className="h-4 w-4" />}
                label="Забрать у клиента"
              />
            </div>
            {deliveryPaid > 0 && (
              <p className="text-[11px] text-sky-600">Уже оплачено за доставку: {formatCurrency(deliveryPaid)}</p>
            )}
          </div>

          {/* Kit checklist */}
          {hasKit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Комплектация</Label>
                <span className={cn(
                  'text-xs font-medium',
                  missingTotals.total > 0 ? 'text-orange-700' : 'text-zinc-500',
                )}>
                  {missingTotals.total > 0 ? `Не сдано: ${missingTotals.total}` : 'Все сдано'}
                </span>
              </div>
              <div className="space-y-2 rounded-xl border bg-zinc-50/60 p-2">
                {items.filter(it => it.selected_kit_items.length > 0).map(it => {
                  const returned = returnedKit[it.id] ?? new Set<string>()
                  return (
                    <div key={it.id} className="rounded-lg bg-white border p-2">
                      <p className="text-xs font-medium text-gray-700 mb-1.5">{it.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {it.selected_kit_items.map(k => {
                          const active = returned.has(k)
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => toggleKit(it.id, k)}
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors min-h-[32px]',
                                active
                                  ? 'border-zinc-200 bg-zinc-50 text-zinc-400 line-through decoration-2'
                                  : 'border-orange-500 bg-orange-500 text-white shadow-sm hover:border-orange-600 hover:bg-orange-600',
                              )}
                            >
                              {active ? '✓ ' : ''}{k}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-500">
                По умолчанию всё сдано (зачёркнуто). Нажмите на элемент, который НЕ вернули — станет оранжевым.
              </p>
            </div>
          )}

          {/* Split payments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Способы оплаты</Label>
              <span className="text-xs text-zinc-500">
                {leaveDebt ? 'Без оплаты' : splits.length > 1 ? 'Сплит-платёж' : 'Один способ'}
              </span>
            </div>

            <div className="space-y-2">
              {splits.map((split, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border bg-zinc-50/60 p-2">
                  <div className="flex flex-wrap gap-1">
                    {(['cash', 'card', 'transfer'] as PaymentMethod[]).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => selectPaymentMethod(i, m)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors min-h-[32px]',
                          !leaveDebt && split.method === m
                            ? 'border-zinc-900 bg-zinc-900 text-white'
                            : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
                        )}
                      >
                        {PAYMENT_METHOD_LABELS[m]}
                      </button>
                    ))}
                    {i === 0 && closingDebt > 0 && (
                      <button
                        type="button"
                        onClick={selectDebt}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors min-h-[32px]',
                          leaveDebt
                            ? 'border-amber-600 bg-amber-600 text-white'
                            : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400',
                        )}
                      >
                        В долг
                      </button>
                    )}
                  </div>
                  {!leaveDebt && (
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={split.amount}
                      onChange={e => updateSplit(i, { amount: e.target.value })}
                      placeholder="Сумма"
                      className="flex-1 min-h-[36px] min-w-[120px]"
                    />
                  )}
                  {!leaveDebt && splits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSplit(i)}
                      className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-red-500 transition-colors"
                      aria-label="Удалить способ"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!leaveDebt && splits.length < 3 && (
              <Button type="button" variant="outline" size="sm" onClick={addSplit} className="min-h-[36px]">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Добавить способ
              </Button>
            )}

            {splits.length > 1 && paidNow > 0 && (
              <div className="flex justify-between items-center rounded-lg bg-zinc-100 px-3 py-2 text-sm">
                <span className="text-zinc-600">Итого к оплате</span>
                <span className="font-semibold tabular-nums">{formatCurrency(paidNow)}</span>
              </div>
            )}

            {leaveDebt ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Оплата не проводится. Заказ закроется, а клиент останется должником на{' '}
                <strong>{formatCurrency(Math.max(0, closingDebt))}</strong>.
              </p>
            ) : (
              <p className="text-[11px] text-gray-500">
                Полная задолженность: <span className="font-medium">{formatCurrency(Math.max(0, closingDebt))}</span>.
                Можно вписать меньше — остаток автоматически останется долгом.
              </p>
            )}
            {paymentIsTooLarge && (
              <p className="text-xs font-medium text-red-600">
                Нельзя принять больше {formatCurrency(Math.max(0, closingDebt))} — это текущий остаток по заказу.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Заметка</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Напр. «оплатил половину наличкой, остаток позже»"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={loading || paymentIsTooLarge || (!leaveDebt && closingDebt > 0 && paidNow <= 0)}
            >
              {loading
                ? 'Закрытие...'
                : leaveDebt
                  ? 'Закрыть в долг'
                  : paidNow > 0
                    ? 'Провести оплату и закрыть'
                    : 'Закрыть заказ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </>
  )
}

function DeliveryCloseToggle({
  active,
  locked,
  onClick,
  icon,
  label,
}: {
  active: boolean
  locked: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-h-[48px] items-center justify-between gap-2 rounded-lg border px-3 text-left text-xs font-medium transition-colors',
        active
          ? 'border-sky-500 bg-white text-sky-800'
          : 'border-sky-200 bg-sky-100/50 text-sky-700 hover:border-sky-400',
        locked && 'cursor-default',
      )}
    >
      <span className="flex items-center gap-1.5">{icon}{label}</span>
      <span className="shrink-0 tabular-nums">{locked ? '✓' : `+${DELIVERY_SERVICE_FEE.toLocaleString('ru')}`}</span>
    </button>
  )
}
