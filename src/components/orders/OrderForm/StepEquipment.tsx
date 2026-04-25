'use client'

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
  const selectedIds = new Set(selectedItems.map(item => item.equipment_id))

  function syncItems(nextItems: OrderItemFormValue[]) {
    onUpdate(recalculateOrderItems(nextItems, equipment, {
      start_date: startDate,
      end_date: endDate,
    }))
  }

  function toggleItem(item: Equipment) {
    if (selectedIds.has(item.id)) {
      syncItems(selectedItems.filter(selected => selected.equipment_id !== item.id))
      return
    }

    const shiftType = getAutoShiftType(startDate, endDate)
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

  function removePosition(equipmentId: string) {
    syncItems(selectedItems.filter(item => item.equipment_id !== equipmentId))
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
          shift_type: getAutoShiftType(startDate, endDate),
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
        Каждая строка техники — отдельная физическая единица. Позицию можно выбрать только один раз.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] mb-5">
        <div>
          <EquipmentGrid
            equipment={equipmentRows}
            selectedIds={selectedIds}
            onToggle={toggleItem}
          />
        </div>

        <div className="lg:sticky lg:top-4 self-start">
          <EquipmentCart
            selectedItems={selectedItems}
            equipment={equipmentRows}
            startDate={startDate}
            endDate={endDate}
            onRemove={removePosition}
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
