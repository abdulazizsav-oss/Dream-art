'use client'

import { formatCurrency, cn } from '@/lib/utils'
import { useOrderTotal } from './useOrderTotal'
import type { Equipment } from '@/types/database'
import type { OrderItemFormValue } from '@/lib/validations/order'
import { Calendar, Package, Wallet } from 'lucide-react'

interface LiveTotalProps {
  startDate: string | undefined | null
  endDate: string | undefined | null
  items: OrderItemFormValue[]
  equipment: Pick<Equipment, 'id' | 'currency'>[]
  variant?: 'compact' | 'card'
  className?: string
}

export function LiveTotal({
  startDate,
  endDate,
  items,
  equipment,
  variant = 'card',
  className,
}: LiveTotalProps) {
  const { days, itemsCount, total, currency } = useOrderTotal(startDate, endDate, items, equipment)

  const daysLabel = days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center justify-between gap-3 text-sm', className)}>
        <div className="flex items-center gap-3 text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {days} {daysLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Package className="w-3.5 h-3.5" />
            {itemsCount}
          </span>
        </div>
        <span className="font-semibold text-gray-900">
          {formatCurrency(total, currency)}
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs text-blue-600 mb-2">
        <Wallet className="w-3.5 h-3.5" />
        Предварительный итог
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-0.5 text-xs text-gray-500">
          <p className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {days} {daysLabel}
          </p>
          <p className="flex items-center gap-1.5">
            <Package className="w-3 h-3" />
            {itemsCount} {itemsCount === 1 ? 'позиция' : itemsCount < 5 ? 'позиции' : 'позиций'}
          </p>
        </div>
        <p className="text-2xl font-bold text-blue-700 tabular-nums">
          {formatCurrency(total, currency)}
        </p>
      </div>
    </div>
  )
}
