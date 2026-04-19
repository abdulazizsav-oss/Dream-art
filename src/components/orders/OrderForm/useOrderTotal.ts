'use client'

import { useMemo } from 'react'
import { calcDays } from '@/lib/utils'
import type { Equipment } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'

export interface OrderTotal {
  days: number
  itemsCount: number
  total: number
  /** Валюта первой позиции (в заказах Dream Art все позиции в UZS/USD синхронны). */
  currency: 'UZS' | 'USD'
}

export function useOrderTotal(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
  items: OrderItemFormValue[],
  equipment: Pick<Equipment, 'id' | 'currency'>[],
): OrderTotal {
  return useMemo(() => {
    const days = startDate && endDate ? Math.max(calcDays(startDate, endDate), 1) : 1
    const total = items.reduce((s, i) => s + (i.daily_rate ?? 0) * days, 0)

    // Берём валюту по первой выбранной единице, дефолт — UZS
    const firstItem = items[0]
    const firstEq = firstItem ? equipment.find(e => e.id === firstItem.equipment_id) : null
    const currency = (firstEq?.currency ?? 'UZS') as 'UZS' | 'USD'

    return {
      days,
      itemsCount: items.length,
      total,
      currency,
    }
  }, [startDate, endDate, items, equipment])
}
