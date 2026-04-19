'use client'

import { useEffect, useMemo, useState } from 'react'
import { Equipment, EquipmentCategory } from '@/types/database'
import { OrderItemFormValue } from '@/lib/validations/order'
import { Button } from '@/components/ui/button'
import { EquipmentGrid, type EquipmentRow } from './EquipmentGrid'
import { EquipmentCart } from './EquipmentCart'

interface StepEquipmentProps {
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
  startDate?: string
  endDate?: string
  selectedItems: OrderItemFormValue[]
  onUpdate: (items: OrderItemFormValue[]) => void
  onNext: () => void
  onBack: () => void
}

/**
 * Модель (группа) определяется по имени техники. Для разных серийников одной модели
 * получаем одну строку в корзине. +/- работает на уровне модели.
 */
function groupKey(eq: Equipment) {
  return eq.name
}

export function StepEquipment({
  equipment, startDate, endDate, selectedItems, onUpdate, onNext, onBack,
}: StepEquipmentProps) {
  const [availability, setAvailability] = useState<Record<string, boolean>>({})

  const equipmentRows = equipment as EquipmentRow[]

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

  /**
   * Счётчик по модели: показываем суммарное количество выбранных единиц для всех карточек той же модели.
   * Т.е. если в корзине Canon R5 (2 шт.) — на всех карточках "Canon R5" будет показываться "×2".
   */
  const selectedCounts = useMemo(() => {
    // Подсчёт по имени модели
    const byModel = new Map<string, number>()
    for (const item of selectedItems) {
      const eq = equipment.find(e => e.id === item.equipment_id)
      if (!eq) continue
      byModel.set(groupKey(eq), (byModel.get(groupKey(eq)) ?? 0) + 1)
    }
    // Распределяем на все карточки этой модели
    const counts = new Map<string, number>()
    for (const row of equipment) {
      const n = byModel.get(groupKey(row))
      if (n) counts.set(row.id, n)
    }
    return counts
  }, [selectedItems, equipment])

  /** Найти следующую свободную единицу заданной модели (той же, что и `anchorEq`). */
  function findFreeUnit(anchorEq: Equipment): Equipment | null {
    const sameModel = equipment.filter(e => e.name === anchorEq.name)
    const usedIds = new Set(selectedItems.map(i => i.equipment_id))
    for (const candidate of sameModel) {
      const avail = availability[candidate.id] !== false
      if (avail && !usedIds.has(candidate.id)) return candidate
    }
    return null
  }

  function addUnit(anchorEq: Equipment) {
    const unit = findFreeUnit(anchorEq)
    if (!unit) return
    const kitItems = ((unit as any).kit_items ?? []) as string[]
    onUpdate([
      ...selectedItems,
      {
        equipment_id: unit.id,
        daily_rate: unit.daily_rate,
        days: 1,
        subtotal: unit.daily_rate,
        condition_on_issue: 'Хорошее',
        selected_kit_items: kitItems, // по умолчанию все выбраны
      },
    ])
  }

  function removeLastOfModel(modelName: string) {
    // Удаляем последний item чья техника имеет это имя
    const next = [...selectedItems]
    for (let i = next.length - 1; i >= 0; i--) {
      const eq = equipment.find(e => e.id === next[i].equipment_id)
      if (eq?.name === modelName) {
        next.splice(i, 1)
        onUpdate(next)
        return
      }
    }
  }

  function removeAllOfModel(modelName: string) {
    onUpdate(
      selectedItems.filter(i => {
        const eq = equipment.find(e => e.id === i.equipment_id)
        return eq?.name !== modelName
      }),
    )
  }

  function handleGridAdd(item: Equipment) {
    addUnit(item)
  }

  function handleCartIncrement(modelName: string) {
    // Найти любую единицу этой модели для поиска свободных
    const anchor = equipment.find(e => e.name === modelName)
    if (!anchor) return
    addUnit(anchor)
  }

  function handleToggleKitItem(index: number, kitItem: string, included: boolean) {
    const next = [...selectedItems]
    const cur = next[index]
    if (!cur) return
    const prev = (cur.selected_kit_items ?? []) as string[]
    next[index] = {
      ...cur,
      selected_kit_items: included
        ? Array.from(new Set([...prev, kitItem]))
        : prev.filter(k => k !== kitItem),
    }
    onUpdate(next)
  }

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Выберите технику</h2>
      {!startDate && (
        <p className="text-xs text-amber-600 mb-3">Даты не выбраны, доступность проверится позже</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Сетка карточек */}
        <div className="lg:col-span-2">
          <EquipmentGrid
            equipment={equipmentRows}
            availability={availability}
            selectedCounts={selectedCounts}
            onAdd={handleGridAdd}
          />
        </div>

        {/* Sticky корзина */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4">
            <EquipmentCart
              selectedItems={selectedItems}
              equipment={equipmentRows}
              startDate={startDate}
              endDate={endDate}
              onIncrement={handleCartIncrement}
              onDecrement={removeLastOfModel}
              onRemoveAll={removeAllOfModel}
              onToggleKitItem={handleToggleKitItem}
            />
          </div>
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
