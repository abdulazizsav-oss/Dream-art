'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PackageCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PartialItem {
  id: string
  name: string
  selected_kit_items: string[]
}

interface Props {
  orderId: string
  items: PartialItem[]
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

/**
 * «Сдать часть» — выбираем, какие позиции заказа сейчас возвращаются.
 * Сумма по сданным позициям замораживается на сервере (computeActiveOrderTotal).
 * Заказ остаётся активным, пока остаются несданные позиции.
 */
export function PartialReturnModal({ orderId, items, variant = 'outline', size = 'default', className }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // Какие позиции сдаём (по умолчанию ничего — пользователь выбирает явно)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // Комплект: по умолчанию все элементы считаются возвращёнными
  const [returnedKit, setReturnedKit] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {}
    for (const it of items) init[it.id] = new Set(it.selected_kit_items)
    return init
  })

  function toggleItem(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleKit(itemId: string, kit: string) {
    setReturnedKit(prev => {
      const next = { ...prev }
      const s = new Set(next[itemId] ?? [])
      if (s.has(kit)) s.delete(kit); else s.add(kit)
      next[itemId] = s
      return next
    })
  }

  const missingTotals = useMemo(() => {
    let total = 0
    for (const id of picked) {
      const src = items.find(it => it.id === id)
      if (!src) continue
      const ret = returnedKit[id] ?? new Set<string>()
      total += src.selected_kit_items.filter(k => !ret.has(k)).length
    }
    return total
  }, [items, picked, returnedKit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (picked.size === 0) {
      toast.error('Выберите хотя бы одну позицию')
      return
    }
    setLoading(true)
    try {
      const payload = {
        items: Array.from(picked).map(id => {
          const src = items.find(it => it.id === id)!
          const returned = Array.from(returnedKit[id] ?? new Set<string>())
          const missing = src.selected_kit_items.filter(k => !returned.includes(k))
          return {
            order_item_id: id,
            condition_on_return: 'Хорошее',
            return_photo_urls: [],
            returned_kit_items: returned,
            missing_kit_items: missing,
          }
        }),
      }

      const res = await fetch(`/api/orders/${orderId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Не удалось сдать позиции')
        return
      }
      const data = await res.json()
      if (data.order_closed) toast.success('Все позиции сданы — заказ закрыт')
      else toast.success(`Сдано позиций: ${data.closed}. Остальные продолжают биллиться.`)

      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (items.length < 2) return null

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <PackageCheck className="w-4 h-4 mr-2" />
        Сдать часть
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Частичная сдача</DialogTitle>
            <DialogDescription>
              Отметьте позиции, которые клиент возвращает сейчас. Сумма по ним зафиксируется от фактического открытия до текущего времени. Остальные продолжат считаться.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Позиции к сдаче</Label>
              <div className="space-y-2 rounded-xl border bg-zinc-50/60 p-2">
                {items.map(it => {
                  const active = picked.has(it.id)
                  const returned = returnedKit[it.id] ?? new Set<string>()
                  return (
                    <div key={it.id} className={cn('rounded-lg border p-2 transition-colors', active ? 'bg-white border-emerald-400' : 'bg-white')}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleItem(it.id)}
                          className="mt-1"
                        />
                        <span className="text-sm font-medium text-gray-800">{it.name}</span>
                      </label>
                      {active && it.selected_kit_items.length > 0 && (
                        <div className="mt-2 pl-6 flex flex-wrap gap-1.5">
                          {it.selected_kit_items.map(k => {
                            const ok = returned.has(k)
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => toggleKit(it.id, k)}
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors min-h-[32px]',
                                  ok
                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                    : 'border-amber-300 bg-amber-50 text-amber-700 line-through',
                                )}
                              >
                                {k}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {missingTotals > 0 && (
                <p className="text-xs font-medium text-amber-700">
                  ⚠ Не возвращено элементов комплекта: {missingTotals}
                </p>
              )}
            </div>

            <p className="text-[11px] text-gray-500">
              Оплату по сданным позициям запишите отдельно через раздел «Финансы» или кнопку «Добавить платёж».
            </p>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" disabled={loading || picked.size === 0}>
                {loading ? 'Фиксируем...' : `Сдать ${picked.size} позиц${picked.size === 1 ? 'ию' : picked.size < 5 ? 'ии' : 'ий'}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
