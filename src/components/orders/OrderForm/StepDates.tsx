'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { calcDays, getTashkentDate } from '@/lib/utils'
import { OrderFormValues, OrderItemFormValue } from '@/lib/validations/order'
import type { Equipment, EquipmentCategory } from '@/types/database'
import { LiveTotal } from './LiveTotal'
import { describeBreakdown, getAutoBillingBreakdown, recalculateOrderItems } from '@/lib/rental'

interface StepDatesProps {
  startDate: string
  endDate: string
  depositAmount: number
  notes: string
  selectedItems: OrderItemFormValue[]
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
  onUpdate: (patch: Partial<OrderFormValues>) => void
  onNext: () => void
  onBack: () => void
}

export function StepDates({
  startDate, endDate, depositAmount, notes, selectedItems, equipment, onUpdate, onNext, onBack,
}: StepDatesProps) {
  const [start, setStart] = useState(startDate || getTashkentDate())
  const [end, setEnd] = useState(endDate || getTashkentDate())
  const [deposit, setDeposit] = useState(depositAmount)
  const [note, setNote] = useState(notes)

  const previewItems = useMemo(() => recalculateOrderItems(selectedItems, equipment, {
    start_date: start,
    end_date: end,
  }), [end, equipment, selectedItems, start])

  function handleNext() {
    onUpdate({
      start_date: start,
      end_date: end,
      deposit_amount: deposit,
      notes: note,
      items: previewItems,
    })
    onNext()
  }

  const days = start && end ? calcDays(start, end) : 0
  const autoBreakdown = getAutoBillingBreakdown(start, end)

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
            Предварительный расчет: <strong>{describeBreakdown(autoBreakdown.dayUnits, autoBreakdown.nightUnits)}</strong>
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">
            Время выдачи и возврата запишется автоматически. Итоговая сумма пересчитается при закрытии заказа — по фактическому времени.
          </p>
        </div>
      )}

      {previewItems.length > 0 && (
        <div className="mb-4">
          <LiveTotal
            startDate={start}
            endDate={end}
            items={previewItems}
            equipment={equipment}
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
        <Button type="button" variant="outline" onClick={onBack}>Назад</Button>
        <Button type="button" onClick={handleNext} disabled={!start || !end}>
          Далее
        </Button>
      </div>
    </div>
  )
}
