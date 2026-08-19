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
  items: OrderItemFormValue[],
  equipment: Pick<Equipment, 'id' | 'currency' | 'day_rate' | 'night_rate' | 'daily_rate' | 'day_night'>[],
  startTime?: string | null,
  endTime?: string | null,
): OrderTotal {
  return useMemo(() => {
    const pricedItems = recalculateOrderItems(items, equipment, {
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
    })
    const breakdown = getAutoBillingBreakdown(startDate, endDate, startTime, endTime)
    const hasNightUnits = pricedItems.some(item => (item.night_units ?? 0) > 0)
    const total = pricedItems.reduce((sum, item) => sum + (item.subtotal ?? 0), 0)

    const firstItem = pricedItems[0]
    const firstEq = firstItem ? equipment.find(e => e.id === firstItem.equipment_id) : null
    const currency = (firstEq?.currency ?? 'UZS') as 'UZS' | 'USD'

    return {
      dayUnits: hasNightUnits || pricedItems.length === 0 ? breakdown.dayUnits : breakdown.totalUnits,
      nightUnits: hasNightUnits ? breakdown.nightUnits : 0,
      itemsCount: pricedItems.length,
      total,
      currency,
    }
  }, [endDate, endTime, equipment, items, startDate, startTime])
}
