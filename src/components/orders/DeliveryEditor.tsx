'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type FulfillmentMethod = 'pickup' | 'delivery'

interface Props {
  orderId: string
  fulfillmentMethod: FulfillmentMethod
  deliveryAddress: string | null
  deliveryFee: number
  hasRentalPayments: boolean
}

export function DeliveryEditor({
  orderId,
  fulfillmentMethod,
  deliveryAddress,
  deliveryFee,
  hasRentalPayments,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [method, setMethod] = useState<FulfillmentMethod>(fulfillmentMethod)
  const [address, setAddress] = useState(deliveryAddress ?? '')
  const [fee, setFee] = useState(String(deliveryFee))
  const pricingLocked = hasRentalPayments

  // После первого платежа самовывоз уже нельзя превратить в доставку, поэтому
  // у такого заказа в редакторе не осталось бы доступных полей.
  if (pricingLocked && fulfillmentMethod === 'pickup') return null

  function showEditor() {
    setMethod(fulfillmentMethod)
    setAddress(deliveryAddress ?? '')
    setFee(String(deliveryFee))
    setOpen(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const normalizedAddress = address.trim()
    const normalizedFee = Number(fee)
    if (method === 'delivery' && !normalizedAddress) {
      toast.error('Укажите адрес доставки')
      return
    }
    if (method === 'delivery' && normalizedAddress.length > 500) {
      toast.error('Адрес должен быть короче 500 символов')
      return
    }
    if (
      method === 'delivery'
      && (fee.trim() === '' || !Number.isSafeInteger(normalizedFee) || normalizedFee < 0)
    ) {
      toast.error('Укажите корректную стоимость доставки')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/delivery`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillment_method: method,
          delivery_address: method === 'delivery' ? normalizedAddress : null,
          delivery_fee: method === 'delivery' ? normalizedFee : 0,
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        toast.error(result.error ?? 'Не удалось обновить доставку')
        return
      }

      toast.success('Условия получения обновлены')
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={showEditor}>
        <Pencil className="h-3.5 w-3.5" />
        Изменить
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Получение заказа</DialogTitle>
            <DialogDescription>
              {pricingLocked
                ? 'После первого платежа можно исправить только адрес доставки.'
                : 'Выберите самовывоз или укажите адрес и стоимость доставки.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1">
              {(['pickup', 'delivery'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  disabled={pricingLocked}
                  onClick={() => setMethod(value)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    method === value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500',
                    pricingLocked && 'cursor-not-allowed opacity-70',
                  )}
                >
                  {value === 'pickup' ? 'Самовывоз' : 'Доставка'}
                </button>
              ))}
            </div>

            {method === 'delivery' && (
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Адрес доставки</span>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                    <textarea
                      value={address}
                      onChange={event => setAddress(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Город, улица, дом, ориентир"
                      className="w-full resize-none rounded-lg border border-input bg-transparent py-2 pl-8 pr-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Стоимость доставки, UZS</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={fee}
                    onChange={event => setFee(event.target.value)}
                    disabled={pricingLocked}
                    placeholder="0"
                  />
                  {pricingLocked && (
                    <span className="block text-xs text-zinc-500">Стоимость зафиксирована после оплаты.</span>
                  )}
                </label>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
