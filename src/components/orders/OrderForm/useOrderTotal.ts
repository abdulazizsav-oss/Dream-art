'use client'

import { useMemo } from 'react'
import type { Equipment } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { getAutoBillingBreakdown, recalculateOrderItems } from '@/lib/rental'

export interface OrderTotal {
  dayUnits: number
  nightUnits: number
  itemsCount: number
  total: number
  /** Валюта первой позиции (в заказах Dream Art все позиции в UZS/USD синхронны). */
  currency: 'UZS' | 'USD'
}

export function useOrderTotal(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
  startTime: string | undefined | null,
  endTime: string | undefined | null,
  items: OrderItemFormValue[],
  equipment: Pick<Equipment, 'id' | 'currency' | 'day_rate' | 'night_rate' | 'daily_rate'>[],
): OrderTotal {
  return useMemo(() => {
    const pricedItems = recalculateOrderItems(items, equipment, {
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
    })
    const breakdown = getAutoBillingBreakdown(startDate, endDate, startTime, endTime)
    const total = pricedItems.reduce((sum, item) => sum + (item.subtotal ?? 0), 0)

    const firstItem = pricedItems[0]
    const firstEq = firstItem ? equipment.find(e => e.id === firstItem.equipment_id) : null
    const currency = (firstEq?.currency ?? 'UZS') as 'UZS' | 'USD'

    return {
      dayUnits: breakdown.dayUnits,
      nightUnits: breakdown.nightUnits,
      itemsCount: pricedItems.length,
      total,
      currency,
    }
  }, [endDate, endTime, equipment, items, startDate, startTime])
}
