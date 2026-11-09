'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useOrderOperation } from './useOrderOperation'
import { OperationNotice } from './OperationNotice'
import { CreditCard, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PAYMENT_METHOD_LABELS, cn, formatCurrency } from '@/lib/utils'

type PaymentMethod = 'cash' | 'transfer' | 'card'

interface Split {
  method: PaymentMethod
  amount: string
}

interface Props {
  orderId: string
  itemId: string
  itemName: string
  remainingDue: number
  currency?: 'UZS' | 'USD'
  className?: string
}

export function PayReturnedItemButton({
  orderId,
  itemId,
  itemName,
  remainingDue,
  currency = 'UZS',
  className,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const operation = useOrderOperation(orderId)
  const loading = operation.pending
  const [notes, setNotes] = useState('')
  const [splits, setSplits] = useState<Split[]>([
    { method: 'cash', amount: remainingDue > 0 ? String(Math.round(remainingDue)) : '' },
  ])

  const paidNow = useMemo(
    () => splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0),
    [splits],
  )
  const remainingAfterPayment = Math.max(0, remainingDue - paidNow)
  const isTooMuch = paidNow > remainingDue + 0.01

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
    if (paidNow <= 0) {
      toast.error('Укажите сумму платежа')
      return
    }
    if (isTooMuch) {
      toast.error('Платёж больше остатка по позиции')
      return
    }

    {
      const paymentSplits = splits
        .map(split => ({ payment_method: split.method, amount: Number(split.amount) }))
        .filter(split => split.amount > 0)

      if (!await operation.submit(`/api/orders/${orderId}/items/${itemId}/payments`, {
        payment_splits: paymentSplits,
        notes: notes || null,
      })) return

      toast.success(
        remainingAfterPayment > 0
          ? `Оплата принята. Осталось: ${formatCurrency(remainingAfterPayment, currency)}`
          : 'Позиция оплачена полностью',
      )
      setOpen(false)
      router.refresh()
    }
  }

  if (remainingDue <= 0) return null

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className}
        onClick={() => setOpen(true)}
      >
        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
        Принять оплату
      </Button>

      <Dialog open={open} onOpenChange={value => { if (!loading) setOpen(value) }}>
        <DialogContent showCloseButton={!loading} className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="pr-10">
            <DialogTitle>Оплата по позиции</DialogTitle>
            <DialogDescription>
              Запишем оплату именно за «{itemName}», чтобы статус позиции стал понятным.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
            <OperationNotice orderId={orderId} message={operation.message} uncertain={operation.uncertain} onChecked={operation.acknowledgeNotSaved} />
            <fieldset disabled={loading || operation.uncertain} className="min-w-0 space-y-4">
            <div className="rounded-xl border bg-zinc-50 p-3 flex justify-between text-sm">
              <span className="text-zinc-600">Остаток по позиции</span>
              <span className="font-semibold text-red-600">{formatCurrency(remainingDue, currency)}</span>
            </div>

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

              <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Сейчас принимаем</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(paidNow, currency)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Остаток после оплаты</span>
                  <span className={remainingAfterPayment > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                    {formatCurrency(remainingAfterPayment, currency)}
                  </span>
                </div>
              </div>

              {isTooMuch && (
                <p className="text-xs font-medium text-red-600">
                  Сумма больше остатка по позиции. Уменьшите платёж.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`notes-PayReturnedItemButton-${orderId}`}>Заметка</Label>
              <Textarea
              id={`notes-PayReturnedItemButton-${orderId}`}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Напр. «доплата за сданную позицию»"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" disabled={loading || paidNow <= 0 || isTooMuch}>
                {loading ? 'Сохраняем...' : 'Принять оплату'}
              </Button>
            </DialogFooter>
          </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
