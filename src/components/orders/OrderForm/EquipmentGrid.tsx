'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Plus, Search, Sun, Moon } from 'lucide-react'
import type { Equipment, EquipmentCategory } from '@/types/database'
import { cn, formatCurrency } from '@/lib/utils'

export type EquipmentRow = Equipment & {
  equipment_categories: (EquipmentCategory & { slug?: string }) | null
}

interface EquipmentGridProps {
  equipment: EquipmentRow[]
  selectedCounts: Map<string, number>
  onAdd: (item: EquipmentRow) => void
}

export function EquipmentGrid({ equipment, selectedCounts, onAdd }: EquipmentGridProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of equipment) {
      const category = item.equipment_categories
      if (category) map.set(category.id, category.name)
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [equipment])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    return equipment.filter(item => {
      if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false

      if (!term) return true

      return [
        item.name,
        item.brand ?? '',
        item.specs ?? '',
        item.notes ?? '',
        item.equipment_categories?.name ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [categoryFilter, equipment, search])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск техники…"
          className="w-full min-h-[46px] rounded-xl border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FilterPill active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
            Все категории
          </FilterPill>
          {categories.map(category => (
            <FilterPill
              key={category.id}
              active={categoryFilter === category.id}
              onClick={() => setCategoryFilter(category.id)}
            >
              {category.name}
            </FilterPill>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-zinc-50 px-6 py-12 text-center text-sm text-zinc-500">
          Ничего не найдено
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {filtered.map(item => {
              const count = selectedCounts.get(item.id) ?? 0
              const dayRate = item.day_rate ?? item.daily_rate
              const nightRate = item.night_rate ?? item.daily_rate
              const showNightRate =
                item.equipment_categories?.slug === 'cameras' && nightRate !== dayRate

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => onAdd(item)}
                  className={cn(
                    'group overflow-hidden rounded-2xl border bg-white text-left transition-all',
                    count > 0
                      ? 'border-zinc-900 shadow-sm'
                      : 'border-zinc-200 hover:border-zinc-400 hover:shadow-sm',
                  )}
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-zinc-50">
                    {item.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <Camera className="h-9 w-9 text-zinc-300" />
                    )}
                    {count > 0 && (
                      <span className="absolute left-2 top-2 inline-flex min-w-[28px] items-center justify-center rounded-full bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">
                        ×{count}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 p-2.5">
                    <p className="line-clamp-1 text-xs font-semibold leading-tight text-zinc-900">
                      {item.name}
                    </p>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-700">
                      <span className="inline-flex items-center gap-1">
                        <Sun className="h-3 w-3 text-amber-500" />
                        {showNightRate ? 'День' : 'Ставка'}
                      </span>
                      <span className="font-semibold tabular-nums">{formatCurrency(dayRate, item.currency)}</span>
                    </div>
                    {showNightRate && (
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-700">
                        <span className="inline-flex items-center gap-1">
                          <Moon className="h-3 w-3 text-indigo-500" />
                          Ночь
                        </span>
                        <span className="font-semibold tabular-nums">{formatCurrency(nightRate, item.currency)}</span>
                      </div>
                    )}
                  </div>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
      )}
    >
      {children}
    </button>
  )
}
