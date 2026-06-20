'use client'

import { useMemo } from 'react'
import type { Equipment, EquipmentCategory } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { Button } from '@/components/ui/button'
import { EquipmentGrid, type EquipmentRow } from './EquipmentGrid'
import { EquipmentCart } from './EquipmentCart'
import { getAutoShiftType, getEquipmentRate, recalculateOrderItems, supportsNightShift } from '@/lib/rental'

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
  const orderableEquipment = equipmentRows.filter(item => item.currency === 'UZS')
  const blockedCurrencyCount = equipmentRows.length - orderableEquipment.length
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
    }))
  }

  function createOrderItem(item: Equipment, template?: OrderItemFormValue): OrderItemFormValue {
    const shiftType = getAutoShiftType(startDate, endDate)
    const nextShiftType = template?.rate_source === 'manual'
      ? (template.shift_type ?? shiftType)
      : shiftType
    const rate = getEquipmentRate(item, nextShiftType)
    const dayRate = item.day_rate ?? item.daily_rate
    const nightRate = supportsNightShift(item) ? (item.night_rate ?? dayRate) : dayRate

    return {
      equipment_id: item.id,
      daily_rate: rate,
      day_rate_snapshot: dayRate,
      night_rate_snapshot: nightRate,
      day_units: 0,
      night_units: 0,
      days: 1,
      subtotal: rate,
      shift_type: nextShiftType,
      rate_source: template?.rate_source ?? 'auto',
      condition_on_issue: 'Хорошее',
      selected_kit_items: [],
    }
  }

  function addUnit(item: Equipment) {
    const template = selectedItems.find(selected => selected.equipment_id === item.id)
    syncItems([
      ...selectedItems,
      createOrderItem(item, template),
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
      const selectedEquipment = equipmentRows.find(row => row.id === equipmentId)
      const nextMode = mode === 'night' && !supportsNightShift(selectedEquipment) ? 'day' : mode

      if (nextMode === 'auto') {
        return {
          ...item,
          rate_source: 'auto' as const,
          shift_type: getAutoShiftType(startDate, endDate),
        }
      }

      return {
        ...item,
        rate_source: 'manual' as const,
        shift_type: nextMode,
      }
    })

    syncItems(next)
  }

  function handleSetManualPrice(equipmentId: string, value: number | null) {
    const next = selectedItems.map(item =>
      item.equipment_id === equipmentId
        ? { ...item, manual_subtotal: value }
        : item,
    )
    syncItems(next)
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Выберите технику</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Позицию можно добавить повторно. Дневная или ночная ставка пересчитается автоматически после выбора даты.
      </p>
      {blockedCurrencyCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {blockedCurrencyCount} поз. скрыто: для них нужно заменить валюту и ставки на UZS.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] mb-5">
        <div>
          <EquipmentGrid
            equipment={orderableEquipment}
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
            onIncrement={handleCartIncrement}
            onDecrement={removeLastOfPosition}
            onRemoveAll={removeAllOfPosition}
            onToggleKitItem={handleToggleKitItem}
            onSetShiftMode={handleSetShiftMode}
            onSetManualPrice={handleSetManualPrice}
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
