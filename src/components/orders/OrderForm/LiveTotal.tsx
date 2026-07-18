'use client'

import { formatCurrency, cn } from '@/lib/utils'
import { useOrderTotal } from './useOrderTotal'
import type { Equipment } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { Calendar, Package, Wallet } from 'lucide-react'
import { describeBreakdown } from '@/lib/rental'

interface LiveTotalProps {
  startDate: string | undefined | null
  endDate: string | undefined | null
  items: OrderItemFormValue[]
  equipment: Pick<Equipment, 'id' | 'currency' | 'day_rate' | 'night_rate' | 'daily_rate' | 'day_night'>[]
  deliveryFee?: number
  showDelivery?: boolean
  variant?: 'compact' | 'card'
  className?: string
}

export function LiveTotal({
  startDate,
  endDate,
  items,
  equipment,
  deliveryFee = 0,
  showDelivery = false,
  variant = 'card',
  className,
}: LiveTotalProps) {
  const { dayUnits, nightUnits, itemsCount, total, currency } = useOrderTotal(
    startDate,
    endDate,
    items,
    equipment,
  )
  const unitsLabel = describeBreakdown(dayUnits, nightUnits)
  const grandTotal = total + (showDelivery ? deliveryFee : 0)

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center justify-between gap-3 text-sm', className)}>
        <div className="flex items-center gap-3 text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {unitsLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Package className="w-3.5 h-3.5" />
            {itemsCount}
          </span>
        </div>
        <span className="font-semibold text-gray-900">
          {formatCurrency(grandTotal, currency)}
        </span>
      </div>
    )
  }

  return (
    <div
        className={cn(
          'rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm',
          className,
        )}
      >
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
        <Wallet className="w-3.5 h-3.5" />
        Предварительный итог
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-0.5 text-xs text-gray-500">
          <p className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {unitsLabel}
          </p>
          <p className="flex items-center gap-1.5">
            <Package className="w-3 h-3" />
            {itemsCount} {itemsCount === 1 ? 'позиция' : itemsCount < 5 ? 'позиции' : 'позиций'}
          </p>
        </div>
        {!showDelivery && (
          <p className="text-2xl font-bold text-zinc-900 tabular-nums">
            {formatCurrency(total, currency)}
          </p>
        )}
      </div>
      {showDelivery && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-sm">
          <div className="flex items-center justify-between gap-3 text-zinc-500">
            <span>Аренда</span>
            <span className="tabular-nums">{formatCurrency(total, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-zinc-500">
            <span>Услуги доставки</span>
            <span className="tabular-nums">
              {deliveryFee === 0 ? 'Бесплатно' : formatCurrency(deliveryFee, 'UZS')}
            </span>
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-zinc-100 pt-2">
            <span className="font-medium text-zinc-700">Итого</span>
            <span className="text-2xl font-bold text-zinc-900 tabular-nums">
              {formatCurrency(grandTotal, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
