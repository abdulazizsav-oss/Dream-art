'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Moon, Plus, ShoppingCart, Sun, Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { describeBreakdown, describeShift, describeUnits, getPricingParts, supportsNightShift } from '@/lib/rental'
import type { RateSource, ShiftType } from '@/lib/rental'
import type { OrderItemFormValue } from '@/lib/validations/order'
import type { EquipmentRow } from './EquipmentGrid'
import { LiveTotal } from './LiveTotal'

interface CartGroup {
  key: string
  name: string
  currency: 'UZS' | 'USD'
  shiftType: ShiftType
  rateSource: RateSource
  manualSubtotal: number | null
  equipment: EquipmentRow | undefined
  entries: { item: OrderItemFormValue; index: number }[]
  kitItems: string[]
}

interface EquipmentCartProps {
  selectedItems: OrderItemFormValue[]
  equipment: EquipmentRow[]
  startDate?: string
  endDate?: string
  onIncrement: (equipmentId: string) => void
  onDecrement: (equipmentId: string) => void
  onRemoveAll: (equipmentId: string) => void
  onToggleKitItem: (index: number, kitItem: string, included: boolean) => void
  onSetShiftMode: (equipmentId: string, mode: 'auto' | ShiftType) => void
  /** value = ручная цена за единицу; null = вернуть авто-расчёт */
  onSetManualPrice: (equipmentId: string, value: number | null) => void
}

function groupByEquipment(items: OrderItemFormValue[], equipment: EquipmentRow[]): CartGroup[] {
  const groups = new Map<string, CartGroup>()

  items.forEach((item, index) => {
    const eq = equipment.find(candidate => candidate.id === item.equipment_id)
    const key = item.equipment_id

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: eq?.name ?? 'Неизвестная позиция',
        currency: (eq?.currency ?? 'UZS') as 'UZS' | 'USD',
        shiftType: item.shift_type ?? 'day',
        rateSource: item.rate_source ?? 'auto',
        equipment: eq,
        entries: [],
        kitItems: (eq?.kit_items ?? []) as string[],
      })
    }

    groups.get(key)!.entries.push({ item, index })
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
  onSetShiftMode,
}: EquipmentCartProps) {
  const groups = groupByEquipment(selectedItems, equipment)

  return (
    <div className="rounded-2xl border bg-white p-3 md:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-zinc-700" />
          <h3 className="text-sm font-semibold text-zinc-900">Выбрано</h3>
        </div>
        <span className="text-xs text-zinc-500">{selectedItems.length} поз.</span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500 mt-4">
          Выбери технику слева, и она появится здесь
        </div>
      ) : (
        <div className="mt-4 space-y-3 max-h-[34rem] lg:max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {groups.map(group => {
              const sampleItem = group.entries[0]?.item
              const breakdownLabel = sampleItem
                ? describeBreakdown(sampleItem.day_units ?? 0, sampleItem.night_units ?? 0)
                : '1 день'
              const pricingLabel = (sampleItem ? getPricingParts(sampleItem) : [])
                .map(part => `${describeShift(part.shiftType)} ${formatCurrency(part.rate, group.currency)} × ${describeUnits(part.units, part.shiftType)}`)
                .join(' + ')

              return (
                <motion.div
                  key={group.key}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-2xl border bg-zinc-50/70 p-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900">{group.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{pricingLabel}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {group.rateSource === 'auto'
                          ? `Авто: ${breakdownLabel}`
                          : `Вручную: ${describeShift(group.shiftType)} (${breakdownLabel})`}
                      </p>
                      {group.equipment?.specs && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{group.equipment.specs}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAll(group.key)}
                      className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-white hover:text-red-500"
                      aria-label="Удалить позицию"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="inline-flex items-center gap-1 self-start rounded-full border bg-white px-1 py-1">
                      <button
                        type="button"
                        onClick={() => onDecrement(group.key)}
                        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-zinc-100"
                        aria-label="Уменьшить"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-[28px] text-center text-sm font-semibold tabular-nums">
                        {group.entries.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => onIncrement(group.key)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white transition-colors hover:bg-zinc-700"
                        aria-label="Добавить"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    {supportsNightShift(group.equipment) && (
                      <div className="grid grid-cols-3 gap-2">
                        <ShiftButton
                          active={group.rateSource === 'auto'}
                          onClick={() => onSetShiftMode(group.key, 'auto')}
                          label="Авто"
                        />
                        <ShiftButton
                          active={group.rateSource === 'manual' && group.shiftType === 'day'}
                          onClick={() => onSetShiftMode(group.key, 'day')}
                          label="День"
                          icon={<Sun className="h-3.5 w-3.5 text-amber-500" />}
                        />
                        <ShiftButton
                          active={group.rateSource === 'manual' && group.shiftType === 'night'}
                          onClick={() => onSetShiftMode(group.key, 'night')}
                          label="Ночь"
                          icon={<Moon className="h-3.5 w-3.5 text-indigo-500" />}
                        />
                      </div>
                    )}
                  </div>

                  {group.kitItems.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3">
                      {group.entries.map((entry, entryIdx) => {
                        const selectedKit = entry.item.selected_kit_items ?? []
                        return (
                          <div key={entry.index}>
                            <p className="mb-1.5 text-[11px] font-medium text-zinc-500">
                              Комплект #{entryIdx + 1}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.kitItems.map(kitItem => {
                                const included = selectedKit.includes(kitItem)
                                return (
                                  <button
                                    key={kitItem}
                                    type="button"
                                    onClick={() => onToggleKitItem(entry.index, kitItem, !included)}
                                    className={cn(
                                      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                                      included
                                        ? 'border-zinc-900 bg-zinc-900 text-white'
                                        : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400',
                                    )}
                                  >
                                    {kitItem}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {selectedItems.length > 0 && (
        <LiveTotal
          startDate={startDate}
          endDate={endDate}
          items={selectedItems}
          equipment={equipment}
          className="mt-4"
        />
      )}
    </div>
  )
}

function ShiftButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
