'use client'

import { useEffect, useMemo, useState } from 'react'
import { Equipment, EquipmentCategory } from '@/types/database'
import { OrderItemFormValue } from '@/lib/validations/order'
import { Button } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { Check, Search } from 'lucide-react'
import { LiveTotal } from './LiveTotal'

interface StepEquipmentProps {
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
  startDate?: string
  endDate?: string
  selectedItems: OrderItemFormValue[]
  onUpdate: (items: OrderItemFormValue[]) => void
  onNext: () => void
  onBack: () => void
}

function getEquipmentGroup(item: Equipment) {
  const brand = item.brand?.trim()
  if (brand) return brand

  const notesPrefix = item.notes?.split('·')[0]?.trim()
  if (notesPrefix && notesPrefix.length <= 24) return notesPrefix

  return item.name.split(/\s+/)[0] || 'Другое'
}

export function StepEquipment({
  equipment, startDate, endDate, selectedItems, onUpdate, onNext, onBack,
}: StepEquipmentProps) {
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

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

  const groupedEquipment = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = equipment.filter(e => {
      if (!term) return true
      return [
        e.name,
        e.brand ?? '',
        e.specs ?? '',
        e.notes ?? '',
        e.equipment_categories?.name ?? '',
      ].join(' ').toLowerCase().includes(term)
    })

    const groups = new Map<string, typeof filtered>()
    for (const item of filtered) {
      const key = item.equipment_categories?.name ?? 'Без категории'
      groups.set(key, [...(groups.get(key) ?? []), item])
    }

    return Array.from(groups.entries()).map(([category, items]) => {
      const brandGroups = new Map<string, typeof filtered>()
      for (const item of items) {
        const key = getEquipmentGroup(item)
        brandGroups.set(key, [...(brandGroups.get(key) ?? []), item])
      }

      return {
        category,
        brandGroups: Array.from(brandGroups.entries()).map(([brand, brandItems]) => ({
          brand,
          items: brandItems,
        })),
      }
    })
  }, [equipment, search])

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Выберите технику</h2>
      {!startDate && (
        <p className="text-xs text-amber-600 mb-3">Даты не выбраны, доступность проверится позже</p>
      )}

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск техники"
          className="w-full min-h-[44px] rounded-lg border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div className="space-y-4 max-h-[28rem] overflow-y-auto mb-4 pr-1">
        {groupedEquipment.map(group => (
          <section key={group.category} className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-500 px-1">{group.category}</p>
            {group.brandGroups.map(brandGroup => (
              <div key={`${group.category}-${brandGroup.brand}`} className="space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-400 px-1 pt-1">
                  {brandGroup.brand}
                </p>
                {brandGroup.items.map(e => {
                  const avail = !startDate || !endDate || availability[e.id] !== false
                  const sel = isSelected(e.id)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      disabled={!avail && !sel}
                      onClick={() => toggle(e)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-lg text-sm border transition-colors',
                        sel ? 'bg-zinc-950 text-white border-zinc-950' :
                        !avail ? 'opacity-45 cursor-not-allowed border-zinc-100 bg-zinc-50' :
                        'hover:bg-zinc-50 border-zinc-200 bg-white'
                      )}
                    >
                      <div className="flex justify-between items-center gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{e.name}</p>
                          {(e.specs || e.notes) && (
                            <p className={cn('text-xs truncate', sel ? 'text-zinc-300' : 'text-zinc-400')}>
                              {e.specs ?? e.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={cn('text-xs', sel ? 'text-zinc-200' : 'text-zinc-600')}>
                            {formatCurrency(e.daily_rate, e.currency)}/д
                          </span>
                          {!avail && !sel && (
                            <span className="text-[10px] text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">
                              занята
                            </span>
                          )}
                          {sel && <Check className="w-4 h-4" />}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </section>
        ))}
        {groupedEquipment.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-8">Ничего не найдено</p>
        )}
      </div>

      {selectedItems.length > 0 && (
        <p className="text-sm text-gray-600 mb-4">
          Выбрано: {selectedItems.length}
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
