'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, PackagePlus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import type { KitComponent, KitSelectionEntry } from '@/lib/kit'

interface Props {
  orderId: string
  orderItemId: string
  equipmentName: string
  catalog: KitComponent[]
  currentSelection: KitSelectionEntry[]
}

export function EditOrderKitModal({
  orderId,
  orderItemId,
  equipmentName,
  catalog,
  currentSelection,
}: Props) {
  const router = useRouter()
  const initial = useMemo(
    () => Object.fromEntries(currentSelection.map(entry => [entry.name, entry.qty])),
    [currentSelection],
  )
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>(initial)

  const changed = catalog.some(component => (
    (quantities[component.name] ?? 0) !== (initial[component.name] ?? 0)
  ))

  function show() {
    setQuantities(initial)
    setOpen(true)
  }

  function setQty(component: KitComponent, qty: number) {
    const minimum = initial[component.name] ?? 0
    setQuantities(current => ({
      ...current,
      [component.name]: Math.min(component.max_qty, Math.max(minimum, qty)),
    }))
  }

  async function save() {
    setLoading(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/items/${orderItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kit_selection: catalog.map(component => ({
            name: component.name,
            qty: quantities[component.name] ?? 0,
          })),
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        toast.error(typeof result.error === 'string' ? result.error : 'Не удалось обновить комплектацию')
        return
      }

      toast.success('Комплектация обновлена')
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (catalog.length === 0) return null

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={show} className="mt-2 min-h-[36px]">
        <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
        Добавить аксессуары
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Комплектация: {equipmentName}</DialogTitle>
            <DialogDescription>
              Добавьте забытые крышки, бленды, кабели и другие аксессуары. Уже выданное уменьшить нельзя.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-xl border bg-zinc-50 p-2">
            {catalog.map(component => {
              const minimum = initial[component.name] ?? 0
              const qty = quantities[component.name] ?? 0
              return (
                <div key={component.name} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{component.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {component.price > 0 ? `${formatCurrency(component.price)}/смена` : 'Входит в комплект'}
                      {minimum > 0 && ` · уже выдано: ${minimum}`}
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-white p-1">
                    <button
                      type="button"
                      aria-label={`Уменьшить ${component.name}`}
                      onClick={() => setQty(component, qty - 1)}
                      disabled={qty <= minimum}
                      className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-zinc-100 disabled:opacity-25"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                    <button
                      type="button"
                      aria-label={`Добавить ${component.name}`}
                      onClick={() => setQty(component, qty + 1)}
                      disabled={qty >= component.max_qty}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-25"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>Отмена</Button>
            <Button type="button" onClick={save} disabled={loading || !changed}>
              {loading ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
