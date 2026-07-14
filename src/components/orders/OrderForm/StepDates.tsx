'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { calcDays, cn, getTashkentDate } from '@/lib/utils'
import { OrderFormValues, OrderItemFormValue } from '@/lib/validations/order'
import type { Equipment, EquipmentCategory } from '@/types/database'
import { LiveTotal } from './LiveTotal'
import { describeBreakdown, getAutoBillingBreakdown, recalculateOrderItems } from '@/lib/rental'
import { MapPin, Package, Truck } from 'lucide-react'

interface StepDatesProps {
  startDate: string
  endDate: string
  depositAmount: number
  notes: string
  fulfillmentMethod: OrderFormValues['fulfillment_method']
  deliveryAddress: string | null
  deliveryFee?: number
  clientAddress: string | null
  selectedItems: OrderItemFormValue[]
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
  onUpdate: (patch: Partial<OrderFormValues>) => void
  onNext: () => void
  onBack: () => void
}

export function StepDates({
  startDate,
  endDate,
  depositAmount,
  notes,
  fulfillmentMethod,
  deliveryAddress,
  deliveryFee,
  clientAddress,
  selectedItems,
  equipment,
  onUpdate,
  onNext,
  onBack,
}: StepDatesProps) {
  const [start, setStart] = useState(startDate || getTashkentDate())
  const [end, setEnd] = useState(endDate || getTashkentDate())
  const [deposit, setDeposit] = useState(depositAmount)
  const [note, setNote] = useState(notes)
  const [method, setMethod] = useState<OrderFormValues['fulfillment_method']>(fulfillmentMethod)
  const [address, setAddress] = useState(deliveryAddress?.trim() || clientAddress?.trim() || '')
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(
    fulfillmentMethod === 'delivery' && deliveryFee !== undefined ? String(deliveryFee) : '',
  )
  const [showDeliveryErrors, setShowDeliveryErrors] = useState(false)

  const previewItems = useMemo(() => recalculateOrderItems(selectedItems, equipment, {
    start_date: start,
    end_date: end,
  }), [end, equipment, selectedItems, start])

  const trimmedAddress = address.trim()
  const trimmedDeliveryFee = deliveryFeeInput.trim()
  const parsedDeliveryFee = Number(trimmedDeliveryFee)
  const hasValidDeliveryFee = /^\d+$/.test(trimmedDeliveryFee)
    && Number.isSafeInteger(parsedDeliveryFee)
    && parsedDeliveryFee >= 0
  const needsDeliveryAddress = method === 'delivery' && !trimmedAddress
  const needsDeliveryFee = method === 'delivery' && !hasValidDeliveryFee
  const previewDeliveryFee = method === 'delivery' && hasValidDeliveryFee ? parsedDeliveryFee : 0

  function persistDraft() {
    const deliveryPatch: Partial<OrderFormValues> = method === 'delivery'
      ? {
          fulfillment_method: 'delivery',
          delivery_address: trimmedAddress || null,
          delivery_fee: hasValidDeliveryFee ? parsedDeliveryFee : undefined,
        }
      : {
          fulfillment_method: 'pickup',
          delivery_address: null,
          delivery_fee: 0,
        }

    onUpdate({
      start_date: start,
      end_date: end,
      deposit_amount: deposit,
      notes: note,
      items: previewItems,
      ...deliveryPatch,
    })
  }

  function handleNext() {
    if (needsDeliveryAddress || needsDeliveryFee) {
      setShowDeliveryErrors(true)
      return
    }

    persistDraft()
    onNext()
  }

  function handleBack() {
    persistDraft()
    onBack()
  }

  function selectMethod(nextMethod: OrderFormValues['fulfillment_method']) {
    setMethod(nextMethod)
    setShowDeliveryErrors(false)
    if (nextMethod === 'delivery' && !address.trim()) {
      setAddress(clientAddress?.trim() || '')
    }
  }

  const days = start && end ? calcDays(start, end) : 0
  const autoBreakdown = getAutoBillingBreakdown(start, end)
  const hasNightUnits = previewItems.some(item => (item.night_units ?? 0) > 0)
  const displayDayUnits = hasNightUnits || previewItems.length === 0 ? autoBreakdown.dayUnits : autoBreakdown.totalUnits
  const displayNightUnits = hasNightUnits ? autoBreakdown.nightUnits : 0

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Даты аренды</h2>

      <div className="grid grid-cols-1 gap-4 mb-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Дата начала</Label>
          <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Дата окончания</Label>
          <Input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} />
        </div>
      </div>

      {days > 0 && (
        <div className="mb-4 rounded-xl border bg-zinc-50 p-3 text-sm text-zinc-700">
          <p>
            Период: <strong>{days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</strong>
          </p>
          <p className="mt-1 text-zinc-500">
            Предварительный расчет: <strong>{describeBreakdown(displayDayUnits, displayNightUnits)}</strong>
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">
            Время выдачи и возврата запишется автоматически. Итоговая сумма пересчитается при закрытии заказа — по фактическому времени.
          </p>
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div>
          <Label className="mb-2 block">Получение заказа</Label>
          <div
            role="radiogroup"
            aria-label="Способ получения заказа"
            className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={method === 'pickup'}
              onClick={() => selectMethod('pickup')}
              className={cn(
                'flex min-h-[42px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                method === 'pickup'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800',
              )}
            >
              <Package className="h-4 w-4" />
              Самовывоз
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={method === 'delivery'}
              onClick={() => selectMethod('delivery')}
              className={cn(
                'flex min-h-[42px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                method === 'delivery'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800',
              )}
            >
              <Truck className="h-4 w-4" />
              Доставка
            </button>
          </div>
        </div>

        {method === 'delivery' && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3 flex items-start gap-2 text-xs text-blue-700">
              <Truck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Дата доставки совпадает с датой начала аренды.</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-1.5">
                <Label htmlFor="delivery-address">Адрес доставки *</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Textarea
                    id="delivery-address"
                    value={address}
                    onChange={event => setAddress(event.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Улица, дом, квартира или ориентир"
                    className={cn(
                      'min-h-[72px] resize-none pl-9',
                      showDeliveryErrors && needsDeliveryAddress && 'border-red-400 focus-visible:ring-red-200',
                    )}
                  />
                </div>
                {showDeliveryErrors && needsDeliveryAddress && (
                  <p className="text-xs text-red-600">Укажите адрес доставки</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delivery-fee">Стоимость, UZS *</Label>
                <Input
                  id="delivery-fee"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={deliveryFeeInput}
                  onChange={event => setDeliveryFeeInput(event.target.value)}
                  placeholder="Например, 50 000"
                  className={cn(
                    'min-h-[44px]',
                    showDeliveryErrors && needsDeliveryFee && 'border-red-400 focus-visible:ring-red-200',
                  )}
                />
                {showDeliveryErrors && needsDeliveryFee ? (
                  <p className="text-xs text-red-600">Введите целое число от 0</p>
                ) : (
                  <p className="text-xs text-zinc-500">0 — бесплатная доставка</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {previewItems.length > 0 && (
        <div className="mb-4">
          <LiveTotal
            startDate={start}
            endDate={end}
            items={previewItems}
            equipment={equipment}
            deliveryFee={previewDeliveryFee}
            showDelivery={method === 'delivery'}
          />
        </div>
      )}

      <div className="space-y-1.5 mb-4">
        <Label>Депозит <span className="text-gray-400 font-normal">(необязательно)</span></Label>
        <Input
          type="number"
          value={deposit || ''}
          onChange={e => setDeposit(Number(e.target.value))}
          placeholder="0 — депозит не берётся"
        />
      </div>

      <div className="space-y-1.5 mb-6">
        <Label>Заметки к заказу</Label>
        <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} />
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={handleBack}>Назад</Button>
        <Button type="button" onClick={handleNext} disabled={!start || !end}>
          Далее
        </Button>
      </div>
    </div>
  )
}
