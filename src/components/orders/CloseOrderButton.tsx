'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle } from 'lucide-react'
import { PAYMENT_METHOD_LABELS, formatCurrency } from '@/lib/utils'

interface CloseOrderButtonProps {
  orderId: string
  debt: number
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

export function CloseOrderButton({ orderId, debt, variant = 'default', size = 'default', className }: CloseOrderButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const initialAmount = debt > 0 ? String(debt) : '0'
  const [amount, setAmount] = useState(initialAmount)
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [leaveDebt, setLeaveDebt] = useState(false)

  const paidNow = Number(amount) || 0
  const remainingDebt = Math.max(0, debt - paidNow)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      // 1) Record a rental payment if any amount was entered
      if (paidNow > 0) {
        const payRes = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            amount: paidNow,
            payment_method: method,
            payment_type: 'rental',
            notes: notes || null,
          }),
        })
        if (!payRes.ok) {
          const err = await payRes.json().catch(() => ({}))
          toast.error(err.error ?? 'Не удалось записать платёж')
          setLoading(false)
          return
        }
      }

      // 2) Close the order
      const closeRes = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
      })
      if (!closeRes.ok) {
        const err = await closeRes.json().catch(() => ({}))
        toast.error(err.error ?? 'Ошибка закрытия заказа')
        setLoading(false)
        return
      }

      if (remainingDebt > 0 && leaveDebt) {
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

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <CheckCircle className="w-4 h-4 mr-2" />
        Закрыть заказ
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Закрытие заказа</DialogTitle>
          <DialogDescription>
            Запишем оплату и освободим технику. Если клиент не рассчитался полностью — оставим долг.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border bg-gray-50 p-3 flex justify-between text-sm">
            <span className="text-gray-600">Задолженность по заказу</span>
            <span className={debt > 0 ? 'font-semibold text-red-600' : 'font-semibold text-green-700'}>
              {formatCurrency(Math.max(0, debt))}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Сумма оплаты сейчас</Label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
            />
            <p className="text-[11px] text-gray-500">
              Полная задолженность: <span className="font-medium">{formatCurrency(Math.max(0, debt))}</span>.
              Можно вписать меньше — остаток уйдёт в долг.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Способ оплаты</Label>
            <Select value={method} onValueChange={setMethod} disabled={paidNow <= 0}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue>{PAYMENT_METHOD_LABELS[method]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {remainingDebt > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <input
                type="checkbox"
                checked={leaveDebt}
                onChange={e => setLeaveDebt(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Закрыть с долгом <strong>{formatCurrency(remainingDebt)}</strong> — клиент доплатит позже.
              </span>
            </label>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={loading || (remainingDebt > 0 && !leaveDebt && paidNow < debt)}
            >
              {loading ? 'Закрытие...' : paidNow > 0 ? 'Провести оплату и закрыть' : 'Закрыть заказ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </>
  )
}
