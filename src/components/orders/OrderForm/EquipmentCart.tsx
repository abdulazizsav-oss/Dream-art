'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Moon, ShoppingCart, Sun, Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { describeBreakdown, describeShift, describeUnits, getPricingParts } from '@/lib/rental'
import type { RateSource, ShiftType } from '@/lib/rental'
import type { OrderItemFormValue } from '@/lib/validations/order'
import type { EquipmentRow } from './EquipmentGrid'
import { LiveTotal } from './LiveTotal'

interface CartItem {
  key: string
  index: number
  item: OrderItemFormValue
  name: string
  currency: 'UZS' | 'USD'
  shiftType: ShiftType
  rateSource: RateSource
  equipment: EquipmentRow | undefined
  kitItems: string[]
}

interface EquipmentCartProps {
  selectedItems: OrderItemFormValue[]
  equipment: EquipmentRow[]
  startDate?: string
  endDate?: string
  onRemove: (equipmentId: string) => void
  onToggleKitItem: (index: number, kitItem: string, included: boolean) => void
  onSetShiftMode: (equipmentId: string, mode: 'auto' | ShiftType) => void
}

function toCartItems(items: OrderItemFormValue[], equipment: EquipmentRow[]): CartItem[] {
  return items.map((item, index) => {
    const eq = equipment.find(candidate => candidate.id === item.equipment_id)

    return {
      key: item.equipment_id,
      index,
      item,
      name: eq?.name ?? 'Неизвестная позиция',
      currency: (eq?.currency ?? 'UZS') as 'UZS' | 'USD',
      shiftType: item.shift_type ?? 'day',
      rateSource: item.rate_source ?? 'auto',
      equipment: eq,
      kitItems: (eq?.kit_items ?? []) as string[],
    }
  })
}

export function EquipmentCart({
  selectedItems,
  equipment,
  startDate,
  endDate,
  onRemove,
  onToggleKitItem,
  onSetShiftMode,
}: EquipmentCartProps) {
  const cartItems = toCartItems(selectedItems, equipment)

  return (
    <div className="rounded-2xl border bg-white p-3 md:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-zinc-700" />
          <h3 className="text-sm font-semibold text-zinc-900">Выбрано</h3>
        </div>
        <span className="text-xs text-zinc-500">{selectedItems.length} поз.</span>
      </div>

      {cartItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500 mt-4">
          Выбери технику слева, и она появится здесь
        </div>
      ) : (
        <div className="mt-4 space-y-3 max-h-[34rem] lg:max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {cartItems.map(cartItem => {
              const breakdownLabel = describeBreakdown(cartItem.item.day_units ?? 0, cartItem.item.night_units ?? 0)
              const pricingLabel = getPricingParts(cartItem.item)
                .map(part => `${describeShift(part.shiftType)} ${formatCurrency(part.rate, cartItem.currency)} × ${describeUnits(part.units, part.shiftType)}`)
                .join(' + ')
              const selectedKit = cartItem.item.selected_kit_items ?? []

              return (
                <motion.div
                  key={cartItem.key}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-2xl border bg-zinc-50/70 p-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900">{cartItem.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{pricingLabel}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {cartItem.rateSource === 'auto'
                          ? `Авто: ${breakdownLabel}`
                          : `Вручную: ${describeShift(cartItem.shiftType)} (${breakdownLabel})`}
                      </p>
                      {cartItem.equipment?.specs && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{cartItem.equipment.specs}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(cartItem.key)}
                      className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-white hover:text-red-500"
                      aria-label="Удалить позицию"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {cartItem.equipment?.equipment_categories?.slug === 'cameras' && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <ShiftButton
                        active={cartItem.rateSource === 'auto'}
                        onClick={() => onSetShiftMode(cartItem.key, 'auto')}
                        label="Авто"
                      />
                      <ShiftButton
                        active={cartItem.rateSource === 'manual' && cartItem.shiftType === 'day'}
                        onClick={() => onSetShiftMode(cartItem.key, 'day')}
                        label="День"
                        icon={<Sun className="h-3.5 w-3.5 text-amber-500" />}
                      />
                      <ShiftButton
                        active={cartItem.rateSource === 'manual' && cartItem.shiftType === 'night'}
                        onClick={() => onSetShiftMode(cartItem.key, 'night')}
                        label="Ночь"
                        icon={<Moon className="h-3.5 w-3.5 text-indigo-500" />}
                      />
                    </div>
                  )}

                  {cartItem.kitItems.length > 0 && (
                    <div className="mt-3 border-t border-zinc-200 pt-3">
                      <p className="mb-1.5 text-[11px] font-medium text-zinc-500">Комплект</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cartItem.kitItems.map(kitItem => {
                          const included = selectedKit.includes(kitItem)
                          return (
                            <button
                              key={kitItem}
                              type="button"
                              onClick={() => onToggleKitItem(cartItem.index, kitItem, !included)}
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
