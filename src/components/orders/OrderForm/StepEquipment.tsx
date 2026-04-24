'use client'

import { useMemo } from 'react'
import type { Equipment, EquipmentCategory } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { Button } from '@/components/ui/button'
import { EquipmentGrid, type EquipmentRow } from './EquipmentGrid'
import { EquipmentCart } from './EquipmentCart'
import { getAutoShiftType, getEquipmentRate, recalculateOrderItems } from '@/lib/rental'

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
  equipment,
  startDate,
  endDate,
  selectedItems,
  onUpdate,
  onNext,
  onBack,
}: StepEquipmentProps) {
  const equipmentRows = equipment as EquipmentRow[]

  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of selectedItems) {
      counts.set(item.equipment_id, (counts.get(item.equipment_id) ?? 0) + 1)
    }
    return counts
  }, [selectedItems])

  function syncItems(nextItems: OrderItemFormValue[]) {
    onUpdate(recalculateOrderItems(nextItems, equipment, {
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
    }))
  }

  function addUnit(item: Equipment) {
    const kitItems = (item.kit_items ?? []) as string[]
    const shiftType = getAutoShiftType(startDate, endDate, startTime, endTime)
    const rate = getEquipmentRate(item, shiftType)

    syncItems([
      ...selectedItems,
      {
        equipment_id: item.id,
        daily_rate: rate,
        day_rate_snapshot: item.day_rate ?? item.daily_rate,
        night_rate_snapshot: item.night_rate ?? item.day_rate ?? item.daily_rate,
        day_units: 0,
        night_units: 0,
        days: 1,
        subtotal: rate,
        shift_type: shiftType,
        rate_source: 'auto',
        condition_on_issue: 'Хорошее',
        selected_kit_items: [],
      },
    ])
  }

  function removeLastOfPosition(equipmentId: string) {
    const next = [...selectedItems]
    const index = next.map(item => item.equipment_id).lastIndexOf(equipmentId)
    if (index === -1) return
    next.splice(index, 1)
    syncItems(next)
  }

  function removeAllOfPosition(equipmentId: string) {
    syncItems(selectedItems.filter(item => item.equipment_id !== equipmentId))
  }

  function handleCartIncrement(equipmentId: string) {
    const item = equipment.find(candidate => candidate.id === equipmentId)
    if (!item) return
    addUnit(item)
  }

  function handleToggleKitItem(index: number, kitItem: string, included: boolean) {
    const next = [...selectedItems]
    const current = next[index]
    if (!current) return

    const selected = current.selected_kit_items ?? []
    next[index] = {
      ...current,
      selected_kit_items: included
        ? Array.from(new Set([...selected, kitItem]))
        : selected.filter(value => value !== kitItem),
    }

    syncItems(next)
  }

  function handleSetShiftMode(equipmentId: string, mode: 'auto' | 'day' | 'night') {
    const next = selectedItems.map(item => {
      if (item.equipment_id !== equipmentId) return item

      if (mode === 'auto') {
        return {
          ...item,
          rate_source: 'auto' as const,
          shift_type: getAutoShiftType(startDate, endDate, startTime, endTime),
        }
      }

      return {
        ...item,
        rate_source: 'manual' as const,
        shift_type: mode,
      }
    })

    syncItems(next)
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Выберите технику</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Позицию можно добавить повторно. Дневная или ночная ставка пересчитается автоматически после выбора даты и времени.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] mb-5">
        <div>
          <EquipmentGrid
            equipment={equipmentRows}
            selectedCounts={selectedCounts}
            onAdd={addUnit}
          />
        </div>

        <div className="lg:sticky lg:top-4 self-start">
          <EquipmentCart
            selectedItems={selectedItems}
            equipment={equipmentRows}
            startDate={startDate}
            endDate={endDate}
            startTime={startTime}
            endTime={endTime}
            onIncrement={handleCartIncrement}
            onDecrement={removeLastOfPosition}
            onRemoveAll={removeAllOfPosition}
            onToggleKitItem={handleToggleKitItem}
            onSetShiftMode={handleSetShiftMode}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack}>Назад</Button>
        <Button type="button" onClick={onNext} disabled={selectedItems.length === 0}>
          Далее
        </Button>
      </div>
    </div>
  )
}
