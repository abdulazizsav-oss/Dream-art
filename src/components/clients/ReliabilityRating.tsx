'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RELIABILITY_LABELS } from '@/lib/utils'

interface ReliabilityRatingProps {
  rating: number
  onChange?: (v: number) => void
  readonly?: boolean
}

export function ReliabilityRating({ rating, onChange, readonly }: ReliabilityRatingProps) {
  const colors = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-blue-400', 'text-green-500']

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(i)}
          className={cn('focus:outline-none', readonly && 'cursor-default')}
        >
          <Star
            className={cn(
              'w-4 h-4',
              i <= rating ? colors[rating - 1] : 'text-gray-200',
              !readonly && 'hover:scale-110 transition-transform'
            )}
            fill={i <= rating ? 'currentColor' : 'none'}
          />
        </button>
      ))}
      <span className="text-xs text-gray-500 ml-1">{RELIABILITY_LABELS[rating]}</span>
    </div>
  )
}
