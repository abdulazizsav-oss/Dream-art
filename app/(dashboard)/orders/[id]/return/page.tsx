'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

interface OrderItem {
  id: string
  subtotal: number
  condition_on_issue: string | null
  equipment: { name: string } | null
}

export default function ReturnPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [items, setItems] = useState<OrderItem[]>([])
  const [returns, setReturns] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(order => {
        const oi = order.order_items ?? []
        setItems(oi)
        const initial: Record<string, string> = {}
        oi.forEach((i: OrderItem) => { initial[i.id] = 'Хорошее' })
        setReturns(initial)
        setLoading(false)
      })
  }, [id])

  async function handleSubmit() {
    setSubmitting(true)
    const payload = items.map(i => ({
      order_item_id: i.id,
      condition_on_return: returns[i.id] ?? 'Хорошее',
      return_photo_urls: [],
    }))
    const res = await fetch(`/api/orders/${id}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: payload }),
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
        {items.map(item => (
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
          </div>
        ))}

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
