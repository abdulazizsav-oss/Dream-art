import type { OrderItemFormValue } from '@/lib/validations/order'
import { recalculateOrderItems } from '@/lib/rental'
import { reconcileKitSelection, sanitizeKitCatalog, type KitComponent } from '@/lib/kit'

type EquipmentPricingRow = {
  id: string
  daily_rate: number | null
  day_rate: number | null
  night_rate: number | null
  day_night: 'day' | 'night' | 'both' | null
  currency: 'UZS' | 'USD' | null
  kit_items: string[] | null
  kit: unknown
}

export class OrderPricingError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'OrderPricingError'
    this.status = status
  }
}

function toNumber(value: number | null | undefined) {
  return Number(value ?? 0)
}

export async function normalizeOrderItemsForBilling(
  supabase: {
    from: (table: 'equipment') => any
  },
  items: OrderItemFormValue[],
  orderContext: {
    start_date: string
    end_date: string
    start_time?: string | null
    end_time?: string | null
  },
): Promise<OrderItemFormValue[]> {
  const equipmentIds = Array.from(new Set(items.map(item => item.equipment_id)))
  const { data, error } = await supabase
    .from('equipment')
    .select('id, daily_rate, day_rate, night_rate, day_night, currency, kit_items, kit')
    .in('id', equipmentIds)

  if (error) throw new OrderPricingError(error.message, 500)

  const equipmentById = new Map(
    ((data ?? []) as EquipmentPricingRow[]).map(row => [
      row.id,
      {
        id: row.id,
        daily_rate: toNumber(row.daily_rate),
        day_rate: toNumber(row.day_rate ?? row.daily_rate),
        night_rate: toNumber(row.night_rate ?? row.day_rate ?? row.daily_rate),
        day_night: row.day_night ?? 'both',
        currency: row.currency ?? 'UZS',
        kit_items: row.kit_items ?? [],
        kit: sanitizeKitCatalog(row.kit),
      },
    ]),
  )

  if (equipmentById.size !== equipmentIds.length) {
    throw new OrderPricingError('Одна или несколько позиций техники не найдены')
  }

  const sanitizedItems = items.map(item => {
    const equipment = equipmentById.get(item.equipment_id)
    if (!equipment) throw new OrderPricingError('Позиция техники не найдена')
    if (equipment.currency !== 'UZS') {
      throw new OrderPricingError('У техники указана неподдерживаемая валюта. Сначала установите ставку в UZS.')
    }

    const allowedKit = new Set(equipment.kit_items)
    // Ручная цена принимается только как неотрицательное число; иначе сбрасываем в авто.
    const manualSubtotal =
      typeof item.manual_subtotal === 'number' && Number.isFinite(item.manual_subtotal) && item.manual_subtotal >= 0
        ? item.manual_subtotal
        : null
    return {
      ...item,
      daily_rate: equipment.day_rate,
      day_rate_snapshot: equipment.day_rate,
      night_rate_snapshot: equipment.night_rate,
      manual_subtotal: manualSubtotal,
      selected_kit_items: (item.selected_kit_items ?? []).filter(kitItem => allowedKit.has(kitItem)),
    }
  })

  // recalculateOrderItems сам замораживает subtotal для позиций с manual_subtotal,
  // поэтому total в RPC (SUM subtotal) учтёт ручные цены автоматически.
  return recalculateOrderItems(
    sanitizedItems,
    Array.from(equipmentById.values()),
    orderContext,
  )
}
