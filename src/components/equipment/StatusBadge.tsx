import { Badge } from '@/components/ui/badge'
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        EQUIPMENT_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700',
        className
      )}
    >
      {EQUIPMENT_STATUS_LABELS[status] ?? status}
    </span>
  )
}
