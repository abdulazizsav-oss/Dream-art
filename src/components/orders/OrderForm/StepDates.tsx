'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { calcDays } from '@/lib/utils'
import { OrderFormValues } from '@/lib/validations/order'

interface StepDatesProps {
  startDate: string
  endDate: string
  depositAmount: number
  notes: string
  selectedEquipmentIds: string[]
  onUpdate: (patch: Partial<OrderFormValues>) => void
  onNext: () => void
  onBack: () => void
}

export function StepDates({
  startDate, endDate, depositAmount, notes, selectedEquipmentIds, onUpdate, onNext, onBack,
}: StepDatesProps) {
  const [start, setStart] = useState(startDate || new Date().toISOString().split('T')[0])
  const [end, setEnd] = useState(endDate || new Date().toISOString().split('T')[0])
  const [deposit, setDeposit] = useState(depositAmount)
  const [note, setNote] = useState(notes)
  const [conflict, setConflict] = useState(false)

  useEffect(() => {
    if (!start || !end || selectedEquipmentIds.length === 0) return
    fetch('/api/equipment/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        equipment_ids: selectedEquipmentIds,
        start_date: start,
        end_date: end,
      }),
    })
      .then(r => r.json())
      .then((avail: Record<string, boolean>) => {
        setConflict(Object.values(avail).some(v => !v))
      })
  }, [start, end, selectedEquipmentIds])

  function handleNext() {
    onUpdate({ start_date: start, end_date: end, deposit_amount: deposit, notes: note })
    onNext()
  }

  const days = start && end ? calcDays(start, end) : 0

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Даты аренды</h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
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
        <p className="text-sm text-gray-600 mb-4">
          Длительность: <strong>{days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</strong>
        </p>
      )}

      {conflict && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
          Некоторая техника уже забронирована на эти даты. Измените даты или вернитесь и уберите конфликтующие позиции.
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
        <Button type="button" onClick={handleNext} disabled={!start || !end || conflict}>
          Далее
        </Button>
      </div>
    </div>
  )
}
