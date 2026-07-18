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
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { calculateDeliveryFee, DELIVERY_SERVICE_FEE } from '@/lib/delivery'

interface StepDatesProps {
  startDate: string
  endDate: string
  depositAmount: number
  notes: string
  deliveryToClient: boolean
  deliveryFromClient: boolean
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
  deliveryToClient,
  deliveryFromClient,
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
  const [toClient, setToClient] = useState(deliveryToClient)
  const [fromClient, setFromClient] = useState(deliveryFromClient)

  const previewItems = useMemo(() => recalculateOrderItems(selectedItems, equipment, {
    start_date: start,
    end_date: end,
  }), [end, equipment, selectedItems, start])

  const previewDeliveryFee = calculateDeliveryFee({
    delivery_to_client: toClient,
    delivery_from_client: fromClient,
  })

  function persistDraft() {
    onUpdate({
      start_date: start,
      end_date: end,
      deposit_amount: deposit,
      notes: note,
      items: previewItems,
      delivery_to_client: toClient,
      delivery_from_client: fromClient,
    })
  }

  function handleNext() {
    persistDraft()
    onNext()
  }

  function handleBack() {
    persistDraft()
    onBack()
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

      <div className="mb-4 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Label className="block">Услуги доставки</Label>
            <p className="mt-1 text-xs text-zinc-500">Адрес не нужен. Каждое направление стоит 50 000 UZS.</p>
          </div>
          {previewDeliveryFee > 0 && (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-blue-700">
              +{previewDeliveryFee.toLocaleString('ru')} UZS
            </span>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <DeliveryToggle
            active={toClient}
            onClick={() => setToClient(value => !value)}
            icon={<ArrowUpFromLine className="h-4 w-4" />}
            title="Отправить клиенту"
          />
          <DeliveryToggle
            active={fromClient}
            onClick={() => setFromClient(value => !value)}
            icon={<ArrowDownToLine className="h-4 w-4" />}
            title="Забрать у клиента"
          />
        </div>
      </div>

      {previewItems.length > 0 && (
        <div className="mb-4">
          <LiveTotal
            startDate={start}
            endDate={end}
            items={previewItems}
            equipment={equipment}
            deliveryFee={previewDeliveryFee}
            showDelivery={previewDeliveryFee > 0}
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

function DeliveryToggle({
  active,
  onClick,
  icon,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-h-[64px] items-center justify-between gap-3 rounded-xl border px-4 text-left transition-colors',
        active
          ? 'border-blue-500 bg-blue-50 text-blue-800'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </span>
      <span className="text-xs font-semibold tabular-nums">+{DELIVERY_SERVICE_FEE.toLocaleString('ru')}</span>
    </button>
  )
}
