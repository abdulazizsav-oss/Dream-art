'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PackageCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMissingKitAge, formatMissingSinceDateTime } from '@/lib/missing-kit'

interface MissingItem {
  order_item_id: string
  equipment_name: string
  missing_kit_items: string[]
  missing?: { kit_name: string; missing_since: string }[]
}

interface Props {
  orderId: string
  items: MissingItem[]
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

/**
 * Позволяет пометить ранее «не возвращённые» элементы комплекта как возвращённые позже.
 */
export function ReturnMissingKitButton({ orderId, items, variant = 'outline', size = 'sm', className }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // selectedByItem[order_item_id] = Set of kit names the user wants to mark as returned now
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  const totalMissing = items.reduce((s, it) => s + it.missing_kit_items.length, 0)
  const totalSelected = useMemo(
    () => Object.values(selected).reduce((s, set) => s + set.size, 0),
    [selected],
  )

  function toggle(orderItemId: string, kit: string) {
    setSelected(prev => {
      const next = { ...prev }
      const s = new Set(next[orderItemId] ?? [])
      if (s.has(kit)) s.delete(kit)
      else s.add(kit)
      next[orderItemId] = s
      return next
    })
  }

  function selectAll() {
    const all: Record<string, Set<string>> = {}
    for (const it of items) all[it.order_item_id] = new Set(it.missing_kit_items)
    setSelected(all)
  }

  function selectNone() {
    setSelected({})
  }

  async function handleSubmit() {
    if (totalSelected === 0) {
      toast.error('Отметьте хотя бы один элемент')
      return
    }
    setLoading(true)
    try {
      const payload = {
        items: items
          .map(it => ({
            order_item_id: it.order_item_id,
            returned_now: Array.from(selected[it.order_item_id] ?? []),
          }))
          .filter(i => i.returned_now.length > 0),
      }
      const res = await fetch(`/api/orders/${orderId}/return-missing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Не удалось сохранить')
        return
      }
      toast.success(`Отмечено как возвращённое: ${totalSelected}`)
      setOpen(false)
      setSelected({})
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (totalMissing === 0) return null

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <PackageCheck className="w-4 h-4 mr-2" />
        Клиент вернул
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Возврат забытых элементов</DialogTitle>
            <DialogDescription>
              Отметьте, что клиент принёс позже. Эти элементы перейдут в «возвращено».
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Выбрано: <strong>{totalSelected}</strong> из {totalMissing}
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={selectAll} disabled={loading}>
                Все
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={selectNone} disabled={loading}>
                Снять
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {items.map(it => {
              const itemSelected = selected[it.order_item_id] ?? new Set<string>()
              const missingDetails = it.missing ?? it.missing_kit_items.map(kit_name => ({ kit_name, missing_since: '' }))
              return (
                <div key={it.order_item_id} className="rounded-xl border bg-zinc-50/60 p-3">
                  <p className="text-sm font-medium text-gray-800 mb-2">{it.equipment_name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingDetails.map(missing => {
                      const active = itemSelected.has(missing.kit_name)
                      return (
                        <button
                          key={missing.kit_name}
                          type="button"
                          onClick={() => toggle(it.order_item_id, missing.kit_name)}
                          className={cn(
                            'rounded-lg border px-2.5 py-1 text-left text-xs font-medium transition-colors min-h-[32px]',
                            active
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-amber-300 bg-amber-50 text-amber-700',
                          )}
                        >
                          <span className="block">{active ? '✓ ' : '⚠ '}{missing.kit_name}</span>
                          {missing.missing_since && (
                            <span className={cn('block text-[10px] font-normal', active ? 'text-emerald-50' : 'text-amber-600')}>
                              с {formatMissingSinceDateTime(missing.missing_since)} · {formatMissingKitAge(missing.missing_since)}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Отмена
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={loading || totalSelected === 0}>
              {loading ? 'Сохранение...' : `Вернуть ${totalSelected || ''}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
