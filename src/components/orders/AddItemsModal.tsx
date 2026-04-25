'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { PackagePlus, Search } from 'lucide-react'

interface EquipmentOption {
  id: string
  name: string
  daily_rate: number
  day_rate: number | null
  night_rate: number | null
  currency: 'UZS' | 'USD'
  brand: string | null
  kit_items?: string[] | null
  equipment_categories?: { name: string | null } | null
  brands?: { name: string | null } | null
}

interface Props {
  orderId: string
  equipment: EquipmentOption[]
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

export function AddItemsModal({ orderId, equipment, variant = 'outline', size = 'default', className }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return equipment
    return equipment.filter(item => {
      const haystack = [
        item.name,
        item.brand,
        item.brands?.name,
        item.equipment_categories?.name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [equipment, search])

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (picked.size === 0) {
      toast.error('Выберите технику для дозаказа')
      return
    }

    const items = Array.from(picked).map(id => {
      const item = equipment.find(candidate => candidate.id === id)!
      const dayRate = item.day_rate ?? item.daily_rate ?? 0
      const nightRate = item.night_rate ?? dayRate
      return {
        equipment_id: item.id,
        daily_rate: dayRate,
        days: 1,
        subtotal: dayRate,
        shift_type: 'day' as const,
        rate_source: 'auto' as const,
        day_rate_snapshot: dayRate,
        night_rate_snapshot: nightRate,
        day_units: 1,
        night_units: 0,
        condition_on_issue: 'Хорошее',
        selected_kit_items: item.kit_items ?? [],
      }
    })

    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Не удалось добавить технику')
        return
      }

      toast.success(`Добавлено позиций: ${items.length}`)
      setPicked(new Set())
      setSearch('')
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <PackagePlus className="w-4 h-4 mr-2" />
        Добавить технику
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Дозаказ техники</DialogTitle>
            <DialogDescription>
              Новые позиции начнут считаться с текущего момента. Уже сданные позиции останутся зафиксированными.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Поиск техники"
                className="pl-9"
              />
            </div>

            <div className="space-y-2 rounded-xl border bg-zinc-50/60 p-2">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-400">Свободной техники не найдено</p>
              ) : filtered.map(item => {
                const active = picked.has(item.id)
                const brand = item.brands?.name ?? item.brand
                const rate = item.day_rate ?? item.daily_rate
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 transition-colors ${
                      active ? 'border-zinc-900' : 'border-zinc-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggle(item.id)}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-zinc-900">{item.name}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {[brand, item.equipment_categories?.name].filter(Boolean).join(' · ') || 'Без категории'}
                      </span>
                    </span>
                    <span className="text-right text-xs font-medium text-zinc-700">
                      {formatCurrency(rate, item.currency)}
                    </span>
                  </label>
                )
              })}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" disabled={loading || picked.size === 0}>
                {loading ? 'Добавляем...' : `Добавить ${picked.size}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
