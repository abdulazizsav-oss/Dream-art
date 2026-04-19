'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Minus, Plus, Trash2, Package, ShoppingCart } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import type { EquipmentRow } from './EquipmentGrid'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { LiveTotal } from './LiveTotal'

interface CartGroup {
  /** Ключ группы — модель (`name` позиции). */
  key: string
  name: string
  unitPrice: number
  currency: 'UZS' | 'USD'
  /** Entries, соответствующие order_items в `selectedItems`. */
  entries: {
    item: OrderItemFormValue
    index: number
    equipment: EquipmentRow | undefined
  }[]
  kitItems: string[]
}

interface EquipmentCartProps {
  selectedItems: OrderItemFormValue[]
  equipment: EquipmentRow[]
  startDate?: string
  endDate?: string
  onIncrement: (modelKey: string) => void
  onDecrement: (modelKey: string) => void
  onRemoveAll: (modelKey: string) => void
  onToggleKitItem: (index: number, kitItem: string, included: boolean) => void
}

function groupByModel(items: OrderItemFormValue[], equipment: EquipmentRow[]): CartGroup[] {
  const groups = new Map<string, CartGroup>()
  items.forEach((item, index) => {
    const eq = equipment.find(e => e.id === item.equipment_id)
    // Группируем по имени (модели). Разные серийные номера одной модели попадают в одну строку.
    const key = eq?.name ?? item.equipment_id
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: eq?.name ?? 'Неизвестная техника',
        unitPrice: item.daily_rate,
        currency: (eq?.currency ?? 'UZS') as 'UZS' | 'USD',
        entries: [],
        kitItems: ((eq as any)?.kit_items ?? []) as string[],
      })
    }
    groups.get(key)!.entries.push({ item, index, equipment: eq })
  })
  return Array.from(groups.values())
}

export function EquipmentCart({
  selectedItems,
  equipment,
  startDate,
  endDate,
  onIncrement,
  onDecrement,
  onRemoveAll,
  onToggleKitItem,
}: EquipmentCartProps) {
  const groups = groupByModel(selectedItems, equipment)

  return (
    <div className="bg-white rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-sm">Корзина</h3>
        </div>
        <span className="text-xs text-gray-400">{selectedItems.length} ед.</span>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">
          Выберите технику слева — она появится здесь
        </p>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 -mr-1">
          <AnimatePresence initial={false}>
            {groups.map(group => (
              <motion.div
                key={group.key}
                layout
                initial={{ opacity: 0, x: 20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl border border-gray-100 bg-gray-50/50 overflow-hidden"
              >
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{group.name}</p>
                      <p className="text-xs text-gray-400">
                        {formatCurrency(group.unitPrice, group.currency)}/д × {group.entries.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAll(group.key)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      aria-label="Удалить все"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* +/- counter */}
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1 bg-white border rounded-full px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => onDecrement(group.key)}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
                        aria-label="Уменьшить"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="min-w-[24px] text-center text-sm font-bold tabular-nums">
                        {group.entries.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => onIncrement(group.key)}
                        className="w-7 h-7 rounded-full flex items-center justify-center bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                        aria-label="Увеличить"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-xs font-semibold text-gray-700">
                      {formatCurrency(group.unitPrice * group.entries.length, group.currency)}/д
                    </span>
                  </div>

                  {/* Комплектация — раскрывается для каждого экземпляра */}
                  {group.kitItems.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      {group.entries.map((entry, entryIdx) => {
                        const selected = (entry.item.selected_kit_items ?? []) as string[]
                        return (
                          <div key={entry.index} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-medium text-gray-500 inline-flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                Комплект #{entryIdx + 1} ({selected.length}/{group.kitItems.length})
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {group.kitItems.map(k => {
                                const included = selected.includes(k)
                                return (
                                  <button
                                    key={k}
                                    type="button"
                                    onClick={() => onToggleKitItem(entry.index, k, !included)}
                                    className={cn(
                                      'text-[10px] font-medium rounded-full px-2 py-0.5 border transition-all',
                                      included
                                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                                        : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300',
                                    )}
                                  >
                                    {included ? '✓ ' : ''}{k}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {selectedItems.length > 0 && (
        <LiveTotal
          startDate={startDate}
          endDate={endDate}
          items={selectedItems}
          equipment={equipment}
        />
      )}
    </div>
  )
}
