'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS, formatCurrency, cn } from '@/lib/utils'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import { useOrderOperation } from '@/components/orders/useOrderOperation'
import { OperationNotice } from '@/components/orders/OperationNotice'

type PaymentMethod = 'cash' | 'transfer' | 'card'

interface PaymentFormProps {
  orders: { id: string; order_number: string; clients: { full_name: string } | null }[]
  defaultOrderId?: string
  onSuccess?: () => void
  onPendingChange?: (pending: boolean) => void
}

interface Split {
  method: PaymentMethod
  amount: string
}

export function PaymentForm({ orders, defaultOrderId, onSuccess, onPendingChange }: PaymentFormProps) {
  const router = useRouter()
  const [orderId, setOrderId] = useState(defaultOrderId ?? '')
  const [type, setType] = useState('rental')
  const [notes, setNotes] = useState('')
  const [splits, setSplits] = useState<Split[]>([{ method: 'cash', amount: '' }])
  const operation = useOrderOperation(orderId)
  const saving = operation.pending
  const fieldId = useId()
  useEffect(() => { onPendingChange?.(saving) }, [saving, onPendingChange])

  const total = useMemo(
    () => splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0),
    [splits],
  )

  function updateSplit(i: number, patch: Partial<Split>) {
    setSplits(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function addSplit() {
    // suggest next method that wasn't used yet
    const used = new Set(splits.map(s => s.method))
    const next = (['cash', 'card', 'transfer'] as PaymentMethod[]).find(m => !used.has(m)) ?? 'card'
    setSplits(prev => [...prev, { method: next, amount: '' }])
  }

  function removeSplit(i: number) {
    setSplits(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orderId) return
    const validSplits = splits
      .map(s => ({ payment_method: s.method, amount: Number(s.amount) }))
      .filter(s => s.amount > 0)
    if (validSplits.length === 0) {
      toast.error('Введите сумму платежа')
      return
    }
    const confirmed = await operation.submit('/api/payments', {
      order_id: orderId,
      payment_type: type,
      notes: notes || null,
      splits: validSplits,
    })
    if (confirmed) {
      toast.success(validSplits.length > 1 ? 'Сплит-платёж добавлен' : 'Платёж добавлен')
      setSplits([{ method: 'cash', amount: '' }])
      setNotes('')
      onSuccess?.()
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg" aria-busy={saving}>
      <OperationNotice orderId={orderId} message={operation.message} uncertain={operation.uncertain} onChecked={operation.acknowledgeNotSaved} />
      <fieldset disabled={saving || operation.uncertain} className="min-w-0 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-order`}>Заказ</Label>
        <Select value={orderId} onValueChange={setOrderId}>
          <SelectTrigger className="w-full min-w-0" id={`${fieldId}-order`}>
            <SelectValue className="min-w-0 truncate" placeholder="Выберите заказ">
              {orderId ? (() => { const o = orders.find(x => x.id === orderId); return o ? `${o.order_number} — ${o.clients?.full_name}` : orderId })() : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {orders.map(o => (
              <SelectItem key={o.id} value={o.id}>
                {o.order_number} — {o.clients?.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-type`}>Тип платежа</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full min-w-0" id={`${fieldId}-type`}><SelectValue className="min-w-0 truncate" placeholder="Тип">{PAYMENT_TYPE_LABELS[type]}</SelectValue></SelectTrigger>
          <SelectContent>
            {Object.entries(PAYMENT_TYPE_LABELS).filter(([key]) => key !== 'refund').map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Способы оплаты</Label>
          <span className="text-xs text-zinc-500">
            {splits.length > 1 ? 'Сплит-платёж' : 'Один способ'}
          </span>
        </div>

        <div className="space-y-2">
          {splits.map((split, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border bg-zinc-50/60 p-2">
              <div className="flex w-full flex-wrap gap-1 sm:w-auto">
                {(['cash', 'card', 'transfer'] as PaymentMethod[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={split.method === m}
                    onClick={() => updateSplit(i, { method: m })}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors min-h-[44px]',
                      split.method === m
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
                    )}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
              <Input
                aria-label={`Сумма: ${PAYMENT_METHOD_LABELS[split.method]}, строка ${i + 1}`}
                min={0}
                type="number"
                inputMode="numeric"
                value={split.amount}
                onChange={e => updateSplit(i, { amount: e.target.value })}
                placeholder="0"
                className="flex-1 min-h-[44px]"
                required
              />
              {splits.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSplit(i)}
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

        {splits.length > 1 && total > 0 && (
          <div className="flex justify-between items-center rounded-lg bg-zinc-100 px-3 py-2 text-sm">
            <span className="text-zinc-600">Итого</span>
            <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-notes`}>Заметка</Label>
        <Textarea id={`${fieldId}-notes`} value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      </div>

      <Button type="submit" disabled={saving || operation.uncertain || !orderId || total <= 0}>
        {saving ? 'Сохранение...' : 'Добавить платёж'}
      </Button>
      </fieldset>
    </form>
  )
}
