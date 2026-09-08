'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, PAYMENT_METHOD_LABELS } from '@/lib/utils'

export function CancellationRefundButton({ orderId, amount, paymentType, requestId }: {
  orderId: string; amount: number; paymentType: 'refund' | 'deposit_return'; requestId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const lock = useRef(false)
  const payload = useRef<object | null>(null)
  async function record() {
    if (lock.current) return
    lock.current = true
    setSaving(true)
    payload.current ??= { request_id: requestId, amount, payment_type: paymentType, payment_method: method }
    try {
      const response = await fetch(`/api/orders/${orderId}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload.current) })
      if (response.status >= 500) throw new Error('uncertain')
      const result = await response.json()
      if (!response.ok) { toast.error(result.error ?? 'Не удалось записать возврат'); return }
      toast.success('Возврат денег записан')
      setOpen(false)
      router.refresh()
    } catch { setUncertain(true); toast.error('Нет подтверждения. Повторная проверка использует тот же запрос и не создаст дубль.') }
    finally { lock.current = false; setSaving(false) }
  }
  return <>
    <Button variant="outline" className="min-h-12" onClick={() => setOpen(true)}>{paymentType === 'deposit_return' ? 'Отметить возврат депозита' : 'Отметить возврат оплаты'}</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value) }}>
      <DialogContent showCloseButton={!saving}>
        <DialogTitle>Деньги возвращены клиенту?</DialogTitle>
        <DialogDescription>Сумма: {formatCurrency(amount)}. Эта кнопка только записывает уже выполненный возврат в журнал платежей.</DialogDescription>
        <label className="space-y-2 text-sm">Способ возврата
          <select aria-label="Способ возврата" className="mt-2 block min-h-12 w-full rounded-xl border bg-white px-3" disabled={saving || uncertain} value={method} onChange={event => { setMethod(event.target.value); payload.current = null }}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {uncertain && <p role="alert" className="text-sm text-amber-800">Ответ не получен. Повторите проверку записи; передавать деньги повторно не нужно.</p>}
        <div className="flex gap-2"><Button variant="outline" disabled={saving} className="min-h-12 flex-1" onClick={() => setOpen(false)}>Назад</Button><Button disabled={saving} className="min-h-12 flex-1" onClick={record}>{saving ? 'Проверяем…' : uncertain ? 'Проверить запись' : 'Деньги возвращены'}</Button></div>
      </DialogContent>
    </Dialog>
  </>
}
