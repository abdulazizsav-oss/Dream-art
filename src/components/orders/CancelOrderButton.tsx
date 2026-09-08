'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'

type ReturnItem = { id: string; name: string; returned: boolean; selected_kit_items: string[]; missing_kit_items: string[] }
export function CancelOrderButton({ orderId, items, refundDue }: { orderId: string; items: ReturnItem[]; refundDue: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const lock = useRef(false)
  const ready = confirmed && reason.trim().length > 0 && items.every(item => checked.includes(item.id))

  async function cancel() {
    if (lock.current || !ready) return
    lock.current = true
    setSaving(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, all_returned: confirmed, items: items.map(({ name, ...item }) => item) }),
      })
      const result = await response.json()
      if (!response.ok) { toast.error(result.error ?? 'Не удалось отменить заказ'); return }
      toast.success('Заказ отменён. Вся техника возвращена, начисления обнулены.')
      setOpen(false)
      router.refresh()
    } catch { toast.error('Ответ не получен. Обновите заказ или повторите отмену — повтор не создаст платёж.') }
    finally { lock.current = false; setSaving(false) }
  }
  return <>
    <Button variant="outline" className="min-h-11 text-red-700" onClick={() => { setChecked([]); setConfirmed(false); setOpen(true) }}>Отменить заказ</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value) }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" showCloseButton={!saving}>
        <DialogTitle>Отмена без начисления аренды</DialogTitle>
        <DialogDescription>Подтвердите, что вся техника и комплекты у вас. Стоимость аренды и доставки станет 0. История заказа и оплат сохранится.</DialogDescription>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">К возврату клиенту: {formatCurrency(refundDue)}. Возврат денег нужно отметить отдельно после фактической передачи.</p>
        <div className="space-y-2">
          {items.map(item => <label key={item.id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={saving} checked={checked.includes(item.id)} onChange={event => setChecked(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />
            <span><span className="block font-medium">{item.name}</span><span className="text-zinc-500">{item.selected_kit_items.length ? `Комплект: ${item.selected_kit_items.join(', ')}` : 'Без дополнительных комплектующих'}{item.missing_kit_items.length > 0 && ` · Проверить недосдачу: ${item.missing_kit_items.join(', ')}`}</span></span>
          </label>)}
        </div>
        <Label htmlFor="cancel-order-reason">Причина отмены</Label>
        <Textarea id="cancel-order-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} disabled={saving} placeholder="Например: клиент вернул комплект и берёт другую технику" />
        <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" disabled={saving} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Всё возвращено, недосдачи нет. Обнулить начисления.</label>
        <div className="flex gap-2"><Button variant="outline" className="min-h-12 flex-1" disabled={saving} onClick={() => setOpen(false)}>Оставить заказ</Button><Button className="min-h-12 flex-1 bg-red-700 hover:bg-red-800" disabled={!ready || saving} onClick={cancel}>{saving ? 'Отменяем…' : 'Подтвердить отмену'}</Button></div>
      </DialogContent>
    </Dialog>
  </>
}
