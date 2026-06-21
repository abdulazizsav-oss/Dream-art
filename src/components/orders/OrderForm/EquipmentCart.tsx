'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Moon, Plus, ShoppingCart, Sun, Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { describeBreakdown, describeShift, describeUnits, getPricingParts, supportsNightShift } from '@/lib/rental'
import type { RateSource, ShiftType } from '@/lib/rental'
import type { OrderItemFormValue } from '@/lib/validations/order'
import type { EquipmentRow } from './EquipmentGrid'
import { LiveTotal } from './LiveTotal'
import { sanitizeKitCatalog, type KitComponent, type KitSelectionEntry } from '@/lib/kit'

interface CartGroup {
  key: string
  name: string
  currency: 'UZS' | 'USD'
  shiftType: ShiftType
  rateSource: RateSource
  manualSubtotal: number | null
  equipment: EquipmentRow | undefined
  entries: { item: OrderItemFormValue; index: number }[]
  kitCatalog: KitComponent[]
  kitSelection: KitSelectionEntry[]
}

interface EquipmentCartProps {
  selectedItems: OrderItemFormValue[]
  equipment: EquipmentRow[]
  startDate?: string
  endDate?: string
  onIncrement: (equipmentId: string) => void
  onDecrement: (equipmentId: string) => void
  onRemoveAll: (equipmentId: string) => void
  onSetKitQty: (equipmentId: string, name: string, qty: number) => void
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
        manualSubtotal: item.manual_subtotal ?? null,
        equipment: eq,
        entries: [],
        kitCatalog: sanitizeKitCatalog((eq as { kit?: unknown } | undefined)?.kit),
        kitSelection: (item.kit_selection ?? []) as KitSelectionEntry[],
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
  onSetKitQty,
  onSetShiftMode,
  onSetManualPrice,
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
                        {group.manualSubtotal != null
                          ? `Своя цена: ${formatCurrency(group.manualSubtotal, group.currency)} / шт.`
                          : group.rateSource === 'auto'
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

                  <div className="mt-3 flex items-center gap-2 border-t border-zinc-200 pt-3">
                    <label className="whitespace-nowrap text-[11px] font-medium text-zinc-500">
                      Своя цена / шт.
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1000}
                      value={group.manualSubtotal ?? ''}
                      onChange={event => {
                        const raw = event.target.value
                        if (raw === '') return onSetManualPrice(group.key, null)
                        const parsed = Number(raw)
                        onSetManualPrice(group.key, Number.isFinite(parsed) ? Math.max(0, parsed) : null)
                      }}
                      placeholder="Авто"
                      className="h-9 w-32 rounded-lg border px-2 text-sm tabular-nums focus:border-zinc-400 focus:outline-none"
                    />
                    {group.manualSubtotal != null && (
                      <button
                        type="button"
                        onClick={() => onSetManualPrice(group.key, null)}
                        className="text-[11px] font-medium text-blue-600 hover:underline"
                      >
                        Сбросить
                      </button>
                    )}
                  </div>

                  {group.kitCatalog.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3">
                      <p className="text-[11px] font-medium text-zinc-500">Комплект (кол-во на 1 шт.)</p>
                      {group.kitCatalog.map(comp => {
                        const qty = group.kitSelection.find(e => e.name === comp.name)?.qty ?? 0
                        const paid = comp.price > 0
                        return (
                          <div key={comp.name} className="flex items-center justify-between gap-2">
                            <div className="min-w-0 truncate">
                              <span className="text-xs text-zinc-700">{comp.name}</span>
                              {paid && (
                                <span className="ml-1 text-[11px] font-medium text-blue-600">
                                  {formatCurrency(comp.price, group.currency)}/смена
                                </span>
                              )}
                            </div>
                            <div className="inline-flex items-center gap-1 rounded-full border bg-white px-1 py-0.5">
                              <button
                                type="button"
                                aria-label="Меньше"
                                onClick={() => onSetKitQty(group.key, comp.name, Math.max(0, qty - 1))}
                                disabled={qty <= 0}
                                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-zinc-100 disabled:opacity-30"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-[20px] text-center text-xs font-semibold tabular-nums">{qty}</span>
                              <button
                                type="button"
                                aria-label="Больше"
                                onClick={() => onSetKitQty(group.key, comp.name, Math.min(comp.max_qty, qty + 1))}
                                disabled={qty >= comp.max_qty}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white transition-colors hover:bg-zinc-700 disabled:opacity-30"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
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
