'use client'

import { Minus, Moon, Plus, ShoppingCart, Sun, Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { describeBreakdown, describeShift, describeUnits, getPricingParts, supportsNightShift } from '@/lib/rental'
import type { RateSource, ShiftType } from '@/lib/rental'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { LiveTotal } from './LiveTotal'
import { sanitizeKitCatalog, type KitComponent, type KitSelectionEntry } from '@/lib/kit'

export interface EquipmentCartRow {
  id: string
  name: string
  currency: 'UZS' | 'USD'
  daily_rate: number
  day_rate: number | null
  night_rate: number | null
  day_night: 'day' | 'night' | 'both' | null
  specs?: string | null
  kit?: unknown
}

interface CartGroup {
  key: string
  name: string
  currency: 'UZS' | 'USD'
  shiftType: ShiftType
  rateSource: RateSource
  manualSubtotal: number | null
  conditionOnIssue: string
  equipment: EquipmentCartRow | undefined
  entries: { item: OrderItemFormValue; index: number }[]
  kitCatalog: KitComponent[]
  kitSelection: KitSelectionEntry[]
}

interface EquipmentCartProps {
  selectedItems: OrderItemFormValue[]
  equipment: EquipmentCartRow[]
  startDate?: string
  endDate?: string
  startTime?: string | null
  endTime?: string | null
  onIncrement: (equipmentId: string) => void
  onDecrement: (equipmentId: string) => void
  onRemoveAll: (equipmentId: string) => void
  onSetKitQty: (equipmentId: string, name: string, qty: number) => void
  onSetShiftMode: (equipmentId: string, mode: 'auto' | ShiftType) => void
  /** value = ручная цена за единицу; null = вернуть авто-расчёт */
  onSetManualPrice: (equipmentId: string, value: number | null) => void
  onSetConditionOnIssue?: (equipmentId: string, value: string) => void
}

function groupByEquipment(items: OrderItemFormValue[], equipment: EquipmentCartRow[]): CartGroup[] {
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
        conditionOnIssue: item.condition_on_issue ?? 'Хорошее',
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
  startTime,
  endTime,
  onIncrement,
  onDecrement,
  onRemoveAll,
  onSetKitQty,
  onSetShiftMode,
  onSetManualPrice,
  onSetConditionOnIssue,
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
          Выберите технику в каталоге, и она появится здесь
        </div>
      ) : (
        <div className="mt-4 space-y-3 lg:max-h-[calc(100dvh-300px)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
          {groups.map(group => {
            const sampleItem = group.entries[0]?.item
            const breakdownLabel = sampleItem
              ? describeBreakdown(sampleItem.day_units ?? 0, sampleItem.night_units ?? 0)
              : '1 день'
            const pricingLabel = (sampleItem ? getPricingParts(sampleItem) : [])
              .map(part => `${describeShift(part.shiftType)} ${formatCurrency(part.rate, group.currency)} × ${describeUnits(part.units, part.shiftType)}`)
              .join(' + ')
            const selectedKit = group.kitSelection.filter(entry => entry.qty > 0)
            const kitSummary = selectedKit
              .map(entry => `${entry.name} × ${entry.qty}`)
              .join(' · ')
            const kitQuantity = selectedKit.reduce((total, entry) => total + entry.qty, 0)

            return (
              <div
                key={group.key}
                className="rounded-2xl border bg-zinc-50/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-zinc-900" title={group.name}>{group.name}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-600">{pricingLabel}</p>
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
                    className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-zinc-500 transition-colors duration-150 hover:bg-white hover:text-red-600 active:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 motion-reduce:transition-none"
                    aria-label={`Удалить ${group.name} из заказа`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  <div className="inline-flex items-center gap-1 self-start rounded-full border bg-white px-1 py-1">
                    <button
                      type="button"
                      onClick={() => onDecrement(group.key)}
                      className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full transition-colors duration-150 hover:bg-zinc-100 active:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 motion-reduce:transition-none"
                      aria-label={`Уменьшить количество: ${group.name}`}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[32px] text-center text-base font-semibold tabular-nums">
                      {group.entries.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => onIncrement(group.key)}
                      className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-zinc-900 text-white transition-colors duration-150 hover:bg-zinc-700 active:bg-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 motion-reduce:transition-none"
                      aria-label={`Добавить ещё: ${group.name}`}
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

                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-zinc-200 pt-3">
                  <label htmlFor={`manual-price-${group.key}`} className="col-span-2 text-xs font-medium text-zinc-600">
                    Своя цена / шт.
                  </label>
                  <input
                    id={`manual-price-${group.key}`}
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
                    className="h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base tabular-nums focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                  {group.manualSubtotal != null && (
                    <button
                      type="button"
                      onClick={() => onSetManualPrice(group.key, null)}
                      className="min-h-[44px] min-w-[44px] touch-manipulation rounded-lg px-2 text-sm font-medium text-blue-700 hover:bg-blue-50 active:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                    >
                      Сбросить
                    </button>
                  )}
                </div>

                {onSetConditionOnIssue && (
                  <div className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3">
                    <label htmlFor={`condition-on-issue-${group.key}`} className="block text-xs font-medium text-zinc-600">
                      Состояние при выдаче
                    </label>
                    <input
                      id={`condition-on-issue-${group.key}`}
                      type="text"
                      value={group.conditionOnIssue}
                      onChange={event => onSetConditionOnIssue(group.key, event.target.value)}
                      placeholder="Например: хорошее, есть царапина"
                      className="h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </div>
                )}

                {group.kitCatalog.length > 0 && (
                  <div className="mt-3 border-t border-zinc-200 pt-1">
                    <div className="min-w-0 py-2">
                      <p className="text-sm font-medium text-zinc-700">Комплект · {kitQuantity} ед. на 1 шт.</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        {kitSummary || 'Ничего не выбрано'}
                      </p>
                    </div>
                    <div className="space-y-3 pb-1 pt-2">
                      {group.kitCatalog.map(comp => {
                        const qty = group.kitSelection.find(e => e.name === comp.name)?.qty ?? 0
                        const paid = comp.price > 0
                        return (
                          <div key={comp.name} className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 basis-28">
                              <span className="text-sm leading-5 text-zinc-700">{comp.name}</span>
                              {paid && (
                                <span className="mt-0.5 block text-xs font-medium text-blue-700">
                                  {formatCurrency(comp.price, group.currency)}/смена
                                </span>
                              )}
                            </div>
                            {comp.max_qty > 1 ? (
                              // Можно взять несколько (напр. аккумулятор) — степпер +/−.
                              <div className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-white px-1 py-0.5">
                                <button
                                  type="button"
                                  aria-label={`Меньше: ${comp.name}`}
                                  onClick={() => onSetKitQty(group.key, comp.name, Math.max(0, qty - 1))}
                                  disabled={qty <= 0}
                                  className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full transition-colors duration-150 hover:bg-zinc-100 active:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-30 motion-reduce:transition-none"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="min-w-[24px] text-center text-base font-semibold tabular-nums">{qty}</span>
                                <button
                                  type="button"
                                  aria-label={`Больше: ${comp.name}`}
                                  onClick={() => onSetKitQty(group.key, comp.name, Math.min(comp.max_qty, qty + 1))}
                                  disabled={qty >= comp.max_qty}
                                  className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-zinc-900 text-white transition-colors duration-150 hover:bg-zinc-700 active:bg-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-30 motion-reduce:transition-none"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              // Только 0 или 1 — кнопка-переключатель «выдан / не выдан».
                              <button
                                type="button"
                                onClick={() => onSetKitQty(group.key, comp.name, qty > 0 ? 0 : 1)}
                                aria-pressed={qty > 0}
                                aria-label={`${qty > 0 ? 'Не выдавать' : 'Выдать'}: ${comp.name}`}
                                className={cn(
                                  'inline-flex min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center gap-1 rounded-full border px-3 text-sm font-medium transition-colors duration-150 active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 motion-reduce:transition-none',
                                  qty > 0
                                    ? 'border-zinc-900 bg-zinc-900 text-white'
                                    : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400',
                                )}
                              >
                                {qty > 0 ? '✓ Выдан' : 'Выдать'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedItems.length > 0 && (
        <LiveTotal
          startDate={startDate}
          endDate={endDate}
          startTime={startTime}
          endTime={endTime}
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
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center gap-1 rounded-xl border px-3 text-sm font-medium transition-colors duration-150 active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 motion-reduce:transition-none',
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
