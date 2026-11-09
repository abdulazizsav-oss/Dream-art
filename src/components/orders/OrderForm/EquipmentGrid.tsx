'use client'

import { useMemo, useState } from 'react'
import { Camera, Search, Sun, Moon } from 'lucide-react'
import type { Equipment, EquipmentCategory } from '@/types/database'
import { cn, formatCurrency } from '@/lib/utils'
import { normalizeSearchText } from '@/lib/search'
import { supportsNightShift } from '@/lib/rental'

export type EquipmentRow = Equipment & {
  equipment_categories: (EquipmentCategory & { slug?: string }) | null
}

interface EquipmentGridProps {
  equipment: EquipmentRow[]
  selectedCounts: Map<string, number>
  onAdd: (item: EquipmentRow) => void
  scrollWithin?: boolean
}

export function EquipmentGrid({ equipment, selectedCounts, onAdd, scrollWithin = true }: EquipmentGridProps) {
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
    const term = normalizeSearchText(search)

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
        .map(normalizeSearchText)
        .join(' ')
        .includes(term)
    })
  }, [categoryFilter, equipment, search])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="search"
          aria-label="Поиск техники"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск техники…"
          className="w-full min-h-[48px] rounded-xl border bg-white pl-10 pr-3 text-base outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {categories.length > 1 && (
        <div className="space-y-2">
          <label className="block xl:hidden">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Категория</span>
            <select aria-label="Категория техники" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="min-h-12 w-full rounded-xl border bg-white px-3 text-base">
              <option value="all">Все категории ({categories.length})</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
        <div role="group" aria-label="Категории техники" className="hidden flex-wrap gap-2 xl:flex">
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
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-zinc-50 px-6 py-12 text-center text-sm text-zinc-500">
          <p>Ничего не найдено</p>
          <button type="button" onClick={() => { setSearch(''); setCategoryFilter('all') }} className="mt-3 min-h-11 rounded-lg border bg-white px-4 font-medium text-zinc-700">Сбросить поиск и категорию</button>
        </div>
      ) : (
        <div role="region" aria-label="Каталог техники" tabIndex={0} className={cn('rounded-xl pr-1 focus-visible:outline-2 focus-visible:outline-zinc-400', scrollWithin && 'lg:max-h-[calc(100dvh-340px)] lg:overflow-y-auto lg:overscroll-y-auto')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
          {filtered.map(item => {
            const count = selectedCounts.get(item.id) ?? 0
            const dayRate = item.day_rate ?? item.daily_rate
            const nightRate = item.night_rate ?? item.daily_rate
            const showNightRate = supportsNightShift(item)

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onAdd(item)}
                aria-label={`Добавить ${item.name} в заказ${count > 0 ? `. Уже выбрано: ${count}` : ''}`}
                className={cn(
                  'min-h-[44px] min-w-0 touch-manipulation overflow-hidden rounded-2xl border bg-white text-left transition-colors duration-150 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 motion-reduce:transition-none',
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
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
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

                <div className="space-y-2 p-3">
                  <p className="min-h-10 line-clamp-2 text-sm font-semibold leading-5 text-zinc-900" title={item.name}>
                    {item.name}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs text-zinc-700">
                    <span className="inline-flex items-center gap-1">
                      <Sun className="h-3.5 w-3.5 text-amber-500" />
                      {showNightRate ? 'День' : 'Ставка'}
                    </span>
                    <span className="whitespace-nowrap font-semibold tabular-nums">{formatCurrency(dayRate, item.currency)}</span>
                  </div>
                  {showNightRate && (
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs text-zinc-700">
                      <span className="inline-flex items-center gap-1">
                        <Moon className="h-3.5 w-3.5 text-indigo-500" />
                        Ночь
                      </span>
                      <span className="whitespace-nowrap font-semibold tabular-nums">{formatCurrency(nightRate, item.currency)}</span>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
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
      aria-pressed={active}
      className={cn(
        'min-h-[48px] min-w-0 touch-manipulation whitespace-normal break-words rounded-xl border px-3 py-2 text-sm font-medium transition-colors duration-150 active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 motion-reduce:transition-none',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
      )}
    >
      {children}
    </button>
  )
}
