'use client'

import { useState, useEffect } from 'react'
import { Equipment, EquipmentCategory } from '@/types/database'
import { OrderItemFormValue } from '@/lib/validations/order'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/equipment/StatusBadge'
import { formatCurrency, cn } from '@/lib/utils'
import { Minus, Plus } from 'lucide-react'

interface StepEquipmentProps {
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
  startDate?: string
  endDate?: string
  selectedItems: OrderItemFormValue[]
  onUpdate: (items: OrderItemFormValue[]) => void
  onNext: () => void
  onBack: () => void
}

export function StepEquipment({
  equipment, startDate, endDate, selectedItems, onUpdate, onNext, onBack,
}: StepEquipmentProps) {
  const [availability, setAvailability] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!startDate || !endDate) return
    fetch('/api/equipment/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        equipment_ids: equipment.map(e => e.id),
        start_date: startDate,
        end_date: endDate,
      }),
    })
      .then(r => r.json())
      .then(setAvailability)
  }, [startDate, endDate, equipment])

  function isSelected(id: string) {
    return selectedItems.some(i => i.equipment_id === id)
  }

  function toggle(item: Equipment) {
    if (isSelected(item.id)) {
      onUpdate(selectedItems.filter(i => i.equipment_id !== item.id))
    } else {
      const days = 1
      onUpdate([
        ...selectedItems,
        {
          equipment_id: item.id,
          daily_rate: item.daily_rate,
          days,
          subtotal: item.daily_rate * days,
          condition_on_issue: 'Хорошее',
        },
      ])
    }
  }

  const available = equipment.filter(e => !startDate || !endDate || availability[e.id] !== false)

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Выберите технику</h2>
      {!startDate && (
        <p className="text-xs text-amber-600 mb-3">Даты не выбраны — доступность не проверяется</p>
      )}

      <div className="space-y-1 max-h-80 overflow-y-auto mb-4">
        {equipment.map(e => {
          const avail = !startDate || availability[e.id] !== false
          const sel = isSelected(e.id)
          return (
            <button
              key={e.id}
              type="button"
              disabled={!avail && !sel}
              onClick={() => toggle(e)}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-lg text-sm border transition-colors',
                sel ? 'bg-blue-50 border-blue-200' :
                !avail ? 'opacity-40 cursor-not-allowed border-transparent' :
                'hover:bg-gray-50 border-transparent'
              )}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-gray-400">
                    {e.equipment_categories?.name ?? 'Без категории'}
                    {e.serial_number && ` · S/N: ${e.serial_number}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">{formatCurrency(e.daily_rate)}/д</span>
                  {!avail && <StatusBadge status="rented" />}
                  {sel && <span className="text-blue-600 font-bold">✓</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selectedItems.length > 0 && (
        <p className="text-sm text-gray-600 mb-4">
          Выбрано: {selectedItems.length} ед.
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack}>Назад</Button>
        <Button type="button" onClick={onNext} disabled={selectedItems.length === 0}>
          Далее
        </Button>
      </div>
    </div>
  )
}
