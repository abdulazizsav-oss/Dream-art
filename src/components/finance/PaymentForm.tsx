'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS } from '@/lib/utils'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface PaymentFormProps {
  orders: { id: string; order_number: string; clients: { full_name: string } | null }[]
  defaultOrderId?: string
}

export function PaymentForm({ orders, defaultOrderId }: PaymentFormProps) {
  const router = useRouter()
  const [orderId, setOrderId] = useState(defaultOrderId ?? '')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [type, setType] = useState('rental')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orderId || !amount) return
    setSaving(true)
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, amount: Number(amount), payment_method: method, payment_type: type, notes: notes || null }),
    })
    if (!res.ok) {
      toast.error('Ошибка добавления платежа')
    } else {
      toast.success('Платёж добавлен')
      setAmount('')
      setNotes('')
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="space-y-1.5">
        <Label>Заказ</Label>
        <Select value={orderId} onValueChange={setOrderId}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите заказ" />
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Сумма</Label>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" required />
        </div>
        <div className="space-y-1.5">
          <Label>Способ</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue placeholder="Способ">{PAYMENT_METHOD_LABELS[method]}</SelectValue></SelectTrigger>
            <SelectContent>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Тип платежа</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Заметка</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      </div>

      <Button type="submit" disabled={saving || !orderId || !amount}>
        {saving ? 'Сохранение...' : 'Добавить платёж'}
      </Button>
    </form>
  )
}
