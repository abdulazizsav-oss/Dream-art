'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Search, Sun, Moon, Sparkles, Check, Plus } from 'lucide-react'
import type { Equipment, EquipmentCategory } from '@/types/database'
import { formatCurrency, cn } from '@/lib/utils'

export type EquipmentRow = Equipment & {
  equipment_categories: (EquipmentCategory & { slug?: string }) | null
}

interface EquipmentGridProps {
  equipment: EquipmentRow[]
  availability: Record<string, boolean>
  selectedCounts: Map<string, number>
  onAdd: (item: EquipmentRow) => void
}

type DayNightFilter = 'all' | 'day' | 'night'

export function EquipmentGrid({ equipment, availability, selectedCounts, onAdd }: EquipmentGridProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [dayNightFilter, setDayNightFilter] = useState<DayNightFilter>('all')
  const [pulseId, setPulseId] = useState<string | null>(null)

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of equipment) {
      const cat = item.equipment_categories
      if (cat) map.set(cat.id, cat.name)
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [equipment])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return equipment.filter(item => {
      // Поиск
      if (term) {
        const hay = [item.name, item.brand ?? '', item.specs ?? '', item.notes ?? '', item.equipment_categories?.name ?? '']
          .join(' ')
          .toLowerCase()
        if (!hay.includes(term)) return false
      }
      // Категория
      if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false
      // День/Ночь (только для камер)
      if (dayNightFilter !== 'all' && item.equipment_categories?.slug === 'cameras') {
        const dn = (item as any).day_night ?? 'both'
        if (dn !== 'both' && dn !== dayNightFilter) return false
      }
      return true
    })
  }, [equipment, search, categoryFilter, dayNightFilter])

  function handleAdd(item: EquipmentRow) {
    onAdd(item)
    setPulseId(item.id)
    setTimeout(() => setPulseId(null), 220)
  }

  return (
    <div className="space-y-4">
      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск техники…"
          className="w-full min-h-[44px] rounded-xl border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Фильтр категорий */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
            Все категории
          </FilterPill>
          {categories.map(c => (
            <FilterPill
              key={c.id}
              active={categoryFilter === c.id}
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.name}
            </FilterPill>
          ))}
        </div>
      )}

      {/* Фильтр день/ночь */}
      <div className="flex gap-1.5">
        <FilterPill active={dayNightFilter === 'all'} onClick={() => setDayNightFilter('all')}>
          <Sparkles className="w-3.5 h-3.5" />
          Все
        </FilterPill>
        <FilterPill active={dayNightFilter === 'day'} onClick={() => setDayNightFilter('day')}>
          <Sun className="w-3.5 h-3.5" />
          День
        </FilterPill>
        <FilterPill active={dayNightFilter === 'night'} onClick={() => setDayNightFilter('night')}>
          <Moon className="w-3.5 h-3.5" />
          Ночь
        </FilterPill>
      </div>

      {/* Сетка карточек */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">Ничего не найдено</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <AnimatePresence initial={false}>
            {filtered.map(item => {
              const avail = availability[item.id] !== false
              const count = selectedCounts.get(item.id) ?? 0
              const isPulsing = pulseId === item.id
              const dn = ((item as any).day_night ?? 'both') as 'day' | 'night' | 'both'
              const isCamera = item.equipment_categories?.slug === 'cameras'

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{
                    opacity: 1,
                    scale: isPulsing ? [1, 0.95, 1] : 1,
                  }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.2 }}
                  disabled={!avail && count === 0}
                  onClick={() => avail && handleAdd(item)}
                  className={cn(
                    'group relative bg-white rounded-2xl border text-left overflow-hidden transition-all',
                    count > 0
                      ? 'border-blue-500 shadow-md shadow-blue-100'
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-md',
                    !avail && count === 0 && 'opacity-45 cursor-not-allowed',
                  )}
                >
                  {/* Счётчик */}
                  {count > 0 && (
                    <div className="absolute top-2 left-2 z-10 bg-blue-600 text-white rounded-full min-w-[24px] h-6 flex items-center justify-center text-xs font-bold px-1.5">
                      ×{count}
                    </div>
                  )}

                  {/* Бейджи день/ночь */}
                  {isCamera && dn !== 'both' && (
                    <div className="absolute top-2 right-2 z-10 bg-white/90 rounded-full w-7 h-7 flex items-center justify-center shadow-sm">
                      {dn === 'day' ? <Sun className="w-3.5 h-3.5 text-amber-600" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                  )}

                  {/* Плашка "занята" */}
                  {!avail && count === 0 && (
                    <div className="absolute top-2 right-2 z-10 text-[10px] text-red-700 bg-red-50 border border-red-100 rounded-full px-1.5 py-0.5">
                      занята
                    </div>
                  )}

                  {/* Фото */}
                  <div className="h-24 sm:h-28 bg-gray-50 flex items-center justify-center overflow-hidden">
                    {item.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <Camera className="w-8 h-8 text-gray-300" />
                    )}
                  </div>

                  {/* Описание */}
                  <div className="p-2.5">
                    <p className="font-semibold text-xs sm:text-sm text-gray-900 line-clamp-2 leading-tight min-h-[2.25rem]">
                      {item.name}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] sm:text-xs font-medium text-gray-700">
                        {formatCurrency(item.daily_rate, item.currency)}
                        <span className="text-gray-400 font-normal">/д</span>
                      </span>
                      {count > 0 ? (
                        <Check className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Plus className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                      )}
                    </div>
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
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
      )}
    >
      {children}
    </button>
  )
}
