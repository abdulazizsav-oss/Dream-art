'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Moon, PackagePlus, Search, Sun } from 'lucide-react'
import {
  getAutoShiftType,
  getEquipmentRate,
  recalculateOrderItems,
  supportsNightShift,
} from '@/lib/rental'
import {
  reconcileKitSelection,
  sanitizeKitCatalog,
  type KitSelectionEntry,
} from '@/lib/kit'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { resolveAddedItemBillingWindow } from '@/lib/orders/add-items'
import { EquipmentCart } from '@/components/orders/OrderForm/EquipmentCart'

interface EquipmentOption {
  id: string
  name: string
  daily_rate: number
  day_rate: number | null
  night_rate: number | null
  day_night: 'day' | 'night' | 'both' | null
  currency: 'UZS' | 'USD'
  brand: string | null
  specs?: string | null
  kit_items?: string[] | null
  kit?: unknown
  equipment_categories?: { name: string | null } | null
  brands?: { name: string | null } | null
}

interface Props {
  orderId: string
  orderEndDate: string
  orderEndTime?: string | null
  equipment: EquipmentOption[]
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

export function AddItemsModal({
  orderId,
  orderEndDate,
  orderEndTime,
  equipment,
  variant = 'outline',
  size = 'default',
  className,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [openedAt, setOpenedAt] = useState(() => new Date())
  const [selectedItems, setSelectedItems] = useState<OrderItemFormValue[]>([])

  const billingWindow = useMemo(() => resolveAddedItemBillingWindow({
    now: openedAt,
    orderEndDate,
    orderEndTime,
  }), [openedAt, orderEndDate, orderEndTime])

  const orderableEquipment = useMemo(
    () => equipment.filter(item => item.currency === 'UZS'),
    [equipment],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orderableEquipment
    return orderableEquipment.filter(item => {
      const haystack = [
        item.name,
        item.brand,
        item.brands?.name,
        item.equipment_categories?.name,
        item.specs,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [orderableEquipment, search])
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of selectedItems) {
      counts.set(item.equipment_id, (counts.get(item.equipment_id) ?? 0) + 1)
    }
    return counts
  }, [selectedItems])

  function syncItems(nextItems: OrderItemFormValue[]) {
    setSelectedItems(recalculateOrderItems(nextItems, equipment, billingWindow))
  }

  function createOrderItem(item: EquipmentOption, template?: OrderItemFormValue): OrderItemFormValue {
    const autoShift = getAutoShiftType(
      billingWindow.start_date,
      billingWindow.end_date,
      billingWindow.start_time,
      billingWindow.end_time,
    )
    const shiftType = template?.rate_source === 'manual'
      ? (template.shift_type ?? autoShift)
      : autoShift
    const rate = getEquipmentRate(item, shiftType)
    const dayRate = item.day_rate ?? item.daily_rate ?? 0
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
      shift_type: shiftType,
      rate_source: template?.rate_source ?? 'auto',
      manual_subtotal: template?.manual_subtotal ?? null,
      condition_on_issue: template?.condition_on_issue ?? 'Хорошее',
      // Комплект выбирается менеджером явно — ничего не добавляем скрыто.
      kit_selection: template?.kit_selection ?? [],
      selected_kit_items: template?.selected_kit_items ?? [],
    }
  }

  function addUnit(item: EquipmentOption) {
    const template = selectedItems.find(selected => selected.equipment_id === item.id)
    syncItems([...selectedItems, createOrderItem(item, template)])
  }

  function removeLastUnit(equipmentId: string) {
    const next = [...selectedItems]
    const index = next.map(item => item.equipment_id).lastIndexOf(equipmentId)
    if (index === -1) return
    next.splice(index, 1)
    syncItems(next)
  }

  function removeAllUnits(equipmentId: string) {
    syncItems(selectedItems.filter(item => item.equipment_id !== equipmentId))
  }

  function setKitQty(equipmentId: string, name: string, qty: number) {
    const eq = equipment.find(item => item.id === equipmentId)
    const catalog = sanitizeKitCatalog(eq?.kit)
    const next = selectedItems.map(item => {
      if (item.equipment_id !== equipmentId) return item
      const current = (item.kit_selection ?? []) as KitSelectionEntry[]
      const updated = qty <= 0
        ? current.filter(entry => entry.name !== name)
        : current.some(entry => entry.name === name)
          ? current.map(entry => entry.name === name ? { ...entry, qty } : entry)
          : [...current, { name, qty, unit_price: catalog.find(entry => entry.name === name)?.price ?? 0 }]
      return { ...item, kit_selection: reconcileKitSelection(updated, catalog) }
    })
    syncItems(next)
  }

  function setShiftMode(equipmentId: string, mode: 'auto' | 'day' | 'night') {
    const next = selectedItems.map(item => {
      if (item.equipment_id !== equipmentId) return item
      const selectedEquipment = equipment.find(candidate => candidate.id === equipmentId)
      const safeMode = mode === 'night' && !supportsNightShift(selectedEquipment) ? 'day' : mode
      if (safeMode === 'auto') {
        return {
          ...item,
          rate_source: 'auto' as const,
          shift_type: getAutoShiftType(
            billingWindow.start_date,
            billingWindow.end_date,
            billingWindow.start_time,
            billingWindow.end_time,
          ),
        }
      }
      return { ...item, rate_source: 'manual' as const, shift_type: safeMode }
    })
    syncItems(next)
  }

  function setManualPrice(equipmentId: string, value: number | null) {
    syncItems(selectedItems.map(item => (
      item.equipment_id === equipmentId ? { ...item, manual_subtotal: value } : item
    )))
  }

  function setConditionOnIssue(equipmentId: string, value: string) {
    setSelectedItems(selectedItems.map(item => (
      item.equipment_id === equipmentId ? { ...item, condition_on_issue: value } : item
    )))
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setOpenedAt(new Date())
      setSelectedItems([])
      setSearch('')
    }
    setOpen(nextOpen)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (selectedItems.length === 0) {
      toast.error('Выберите технику для дозаказа')
      return
    }

    const items = selectedItems.map(item => ({
      ...item,
      condition_on_issue: item.condition_on_issue?.trim() || 'Хорошее',
    }))

    setLoading(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        toast.error(typeof result.error === 'string' ? result.error : 'Не удалось добавить технику')
        return
      }

      toast.success(`Добавлено позиций: ${items.length}. Начисление идёт с текущего времени.`)
      setSelectedItems([])
      setSearch('')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Не удалось связаться с сервером')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => handleOpenChange(true)}>
        <PackagePlus className="w-4 h-4 mr-2" />
        Добавить технику
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Добавить технику в активный заказ</DialogTitle>
            <DialogDescription>
              Выберите количество, смену, свою цену, состояние и комплект. Фактическое начисление каждой новой позиции начнётся в момент сохранения; предварительный расчёт сейчас — с {formatDateTime(openedAt)}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <Input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Поиск техники"
                    className="pl-9"
                  />
                </div>

                <div className="max-h-[34rem] space-y-2 overflow-y-auto rounded-xl border bg-zinc-50/60 p-2">
                  {filtered.length === 0 ? (
                    <p className="py-6 text-center text-sm text-zinc-400">Техника не найдена</p>
                  ) : filtered.map(item => {
                    const count = selectedCounts.get(item.id) ?? 0
                    const brand = item.brands?.name ?? item.brand
                    const rate = item.day_rate ?? item.daily_rate
                    const hasNightShift = supportsNightShift(item)
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => addUnit(item)}
                        className={`flex w-full items-start gap-3 rounded-lg border bg-white p-3 text-left transition-colors ${
                          count > 0 ? 'border-zinc-900' : 'border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                            {item.name}
                            {count > 0 && (
                              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white">×{count}</span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-zinc-500">
                            {[brand, item.equipment_categories?.name].filter(Boolean).join(' · ') || 'Без категории'}
                          </span>
                          <span className="mt-1 block text-[11px] font-medium text-blue-600">+ Добавить единицу</span>
                        </span>
                        <span className="space-y-0.5 text-right text-xs font-medium text-zinc-700">
                          <span className="flex items-center justify-end gap-1">
                            <Sun className="h-3 w-3 text-amber-500" />
                            {formatCurrency(rate, item.currency)}
                          </span>
                          {hasNightShift && (
                            <span className="flex items-center justify-end gap-1">
                              <Moon className="h-3 w-3 text-indigo-500" />
                              {formatCurrency(item.night_rate ?? rate, item.currency)}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <EquipmentCart
                selectedItems={selectedItems}
                equipment={equipment}
                startDate={billingWindow.start_date}
                endDate={billingWindow.end_date}
                startTime={billingWindow.start_time}
                endTime={billingWindow.end_time}
                onIncrement={equipmentId => {
                  const item = equipment.find(candidate => candidate.id === equipmentId)
                  if (item) addUnit(item)
                }}
                onDecrement={removeLastUnit}
                onRemoveAll={removeAllUnits}
                onSetKitQty={setKitQty}
                onSetShiftMode={setShiftMode}
                onSetManualPrice={setManualPrice}
                onSetConditionOnIssue={setConditionOnIssue}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" disabled={loading || selectedItems.length === 0}>
                {loading ? 'Добавляем…' : `Добавить ${selectedItems.length} позиц${selectedItems.length === 1 ? 'ию' : selectedItems.length < 5 ? 'ии' : 'ий'}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
