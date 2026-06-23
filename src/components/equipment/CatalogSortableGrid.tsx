'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Camera,
  ChevronRight,
  GripVertical,
  Moon,
  Pencil,
  RotateCcw,
  Save,
  Sun,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { supportsNightShift } from '@/lib/rental'

type Currency = 'UZS' | 'USD'
type NightMode = 'day' | 'night' | 'both'

interface CategoryCard {
  id: string
  name: string
  photo_url: string | null
  sort_order: number
}

interface EquipmentCard {
  id: string
  name: string
  photo_url: string | null
  specs: string | null
  daily_rate: number
  day_rate: number | null
  night_rate: number | null
  day_night: NightMode | null
  currency: Currency
  sort_order: number
  brands?: { name: string; logo_url: string | null } | null
}

function withSortOrders<T extends { id: string }>(items: T[]) {
  return items.map((item, index) => ({ ...item, sort_order: (index + 1) * 10 }))
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (!item) return items
  next.splice(to, 0, item)
  return next
}

function useSortableItems<T extends { id: string; sort_order: number }>(initialItems: T[]) {
  const [items, setItems] = useState(initialItems)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  useEffect(() => setItems(initialItems), [initialItems])

  const dirty = useMemo(() => {
    if (items.length !== initialItems.length) return true
    return items.some((item, index) => item.id !== initialItems[index]?.id)
  }, [initialItems, items])

  function moveById(activeId: string, overId: string) {
    if (activeId === overId) return
    const from = items.findIndex(item => item.id === activeId)
    const to = items.findIndex(item => item.id === overId)
    if (from < 0 || to < 0) return
    setItems(withSortOrders(moveItem(items, from, to)))
  }

  function moveByStep(id: string, step: -1 | 1) {
    const from = items.findIndex(item => item.id === id)
    const to = from + step
    if (from < 0 || to < 0 || to >= items.length) return
    setItems(withSortOrders(moveItem(items, from, to)))
  }

  function reset() {
    setItems(initialItems)
    setDraggedId(null)
  }

  return {
    items,
    setItems,
    draggedId,
    setDraggedId,
    dirty,
    moveById,
    moveByStep,
    reset,
  }
}

async function saveOrder(endpoint: string, items: { id: string; sort_order: number }[], extra?: Record<string, unknown>) {
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...extra, items: items.map(({ id, sort_order }) => ({ id, sort_order })) }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error ?? 'Не удалось сохранить порядок')
  }
}

export function CatalogCategoryGrid({ categories }: { categories: CategoryCard[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const sortable = useSortableItems(categories)

  function handleSave() {
    startTransition(async () => {
      try {
        await saveOrder('/api/categories/reorder', sortable.items)
        toast.success('Порядок категорий сохранён')
        setEditing(false)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Не удалось сохранить порядок')
      }
    })
  }

  return (
    <div className="space-y-4">
      <GridToolbar
        editing={editing}
        dirty={sortable.dirty}
        pending={isPending}
        onEdit={() => setEditing(true)}
        onCancel={() => { sortable.reset(); setEditing(false) }}
        onReset={sortable.reset}
        onSave={handleSave}
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {sortable.items.map((cat, index) => (
          <div
            key={cat.id}
            draggable={editing}
            onDragStart={() => sortable.setDraggedId(cat.id)}
            onDragOver={event => { if (editing) event.preventDefault() }}
            onDrop={() => { if (editing && sortable.draggedId) sortable.moveById(sortable.draggedId, cat.id) }}
            onDragEnd={() => sortable.setDraggedId(null)}
            className={cn(
              'group relative overflow-hidden rounded-2xl border bg-white transition-all',
              editing ? 'cursor-grab border-zinc-300 shadow-sm active:cursor-grabbing' : 'hover:border-blue-300 hover:shadow-md',
              sortable.draggedId === cat.id && 'opacity-50',
            )}
          >
            {editing ? (
              <CategoryCardBody
                cat={cat}
                index={index}
                editing
                onMoveUp={() => sortable.moveByStep(cat.id, -1)}
                onMoveDown={() => sortable.moveByStep(cat.id, 1)}
              />
            ) : (
              <>
                <Link
                  href="/admin/categories"
                  aria-label="Редактировать категории"
                  className="absolute left-2 top-2 z-10 inline-flex items-center justify-center rounded-lg bg-white/90 p-2 shadow-sm transition-opacity hover:bg-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Pencil className="h-4 w-4 text-gray-600" />
                </Link>
                <Link href={`/equipment?category=${cat.id}`} className="block">
                  <CategoryCardBody cat={cat} index={index} editing={false} />
                </Link>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryCardBody({
  cat,
  index,
  editing,
  onMoveUp,
  onMoveDown,
}: {
  cat: CategoryCard
  index: number
  editing: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  return (
    <>
      {editing && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-zinc-600 shadow-sm">
          <GripVertical className="h-3.5 w-3.5" />
          {String(index + 1).padStart(2, '0')}
        </div>
      )}
      <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gray-50">
        {cat.photo_url ? (
          <img
            src={cat.photo_url}
            alt={cat.name}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <Boxes className="h-10 w-10 text-gray-200 transition-colors group-hover:text-gray-300" />
        )}
        {!editing && (
          <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-white">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="truncate font-semibold text-gray-900">{cat.name}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-sm text-gray-400">{editing ? 'Позиция в сетке' : 'Открыть категорию'}</p>
          {editing && (
            <MoveButtons onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
          )}
        </div>
      </div>
    </>
  )
}

export function CatalogEquipmentGrid({
  equipment,
  categoryId,
  canReorder,
}: {
  equipment: EquipmentCard[]
  categoryId: string
  canReorder: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const sortable = useSortableItems(equipment)

  function handleSave() {
    startTransition(async () => {
      try {
        await saveOrder('/api/equipment/reorder', sortable.items, { category_id: categoryId })
        toast.success('Порядок техники сохранён')
        setEditing(false)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Не удалось сохранить порядок')
      }
    })
  }

  return (
    <div className="space-y-4">
      <GridToolbar
        editing={editing}
        dirty={sortable.dirty}
        pending={isPending}
        disabled={!canReorder}
        disabledReason={!canReorder ? 'Откройте Все без фильтра бренда, чтобы менять общий порядок техники' : undefined}
        onEdit={() => setEditing(true)}
        onCancel={() => { sortable.reset(); setEditing(false) }}
        onReset={sortable.reset}
        onSave={handleSave}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortable.items.map((item, index) => (
          <div
            key={item.id}
            draggable={editing}
            onDragStart={() => sortable.setDraggedId(item.id)}
            onDragOver={event => { if (editing) event.preventDefault() }}
            onDrop={() => { if (editing && sortable.draggedId) sortable.moveById(sortable.draggedId, item.id) }}
            onDragEnd={() => sortable.setDraggedId(null)}
            className={cn(
              'group relative overflow-hidden rounded-2xl border bg-white transition-all',
              editing ? 'cursor-grab border-zinc-300 shadow-sm active:cursor-grabbing' : 'hover:border-blue-300 hover:shadow-md',
              sortable.draggedId === item.id && 'opacity-50',
            )}
          >
            {editing ? (
              <EquipmentCardBody
                item={item}
                index={index}
                editing
                onMoveUp={() => sortable.moveByStep(item.id, -1)}
                onMoveDown={() => sortable.moveByStep(item.id, 1)}
              />
            ) : (
              <>
                <Link
                  href={`/equipment/${item.id}`}
                  aria-label="Редактировать"
                  className="absolute right-2 top-2 z-10 inline-flex items-center justify-center rounded-lg bg-white/90 p-2 shadow-sm transition-opacity hover:bg-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Pencil className="h-4 w-4 text-gray-600" />
                </Link>
                <Link href={`/equipment/${item.id}`} className="block">
                  <EquipmentCardBody item={item} index={index} editing={false} />
                </Link>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function EquipmentCardBody({
  item,
  index,
  editing,
  onMoveUp,
  onMoveDown,
}: {
  item: EquipmentCard
  index: number
  editing: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const brand = item.brands ?? null
  const dayRate = item.day_rate ?? item.daily_rate
  const nightRate = item.night_rate ?? item.daily_rate
  const hasNightShift = supportsNightShift(item)

  return (
    <>
      {editing && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-zinc-600 shadow-sm">
          <GripVertical className="h-3.5 w-3.5" />
          {String(index + 1).padStart(2, '0')}
        </div>
      )}
      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gray-50">
        {item.photo_url ? (
          <img
            src={item.photo_url}
            alt={item.name}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <Camera className="h-12 w-12 text-gray-200" />
        )}
        {brand?.logo_url && (
          <img
            src={brand.logo_url}
            alt={brand.name}
            loading="lazy"
            draggable={false}
            className="absolute left-2 top-2 h-8 w-8 rounded-lg bg-white/90 object-contain p-1 shadow-sm"
          />
        )}
      </div>
      <div className="p-4">
        {brand && !brand.logo_url && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{brand.name}</p>
        )}
        <p className="font-semibold leading-snug text-gray-900">{item.name}</p>
        {item.specs && <p className="mt-1 line-clamp-1 text-xs text-gray-500">{item.specs}</p>}
        <div className="mt-3 space-y-1.5 border-t pt-3 text-xs">
          <div className="flex items-center justify-between text-gray-700">
            <span className="inline-flex items-center gap-1">
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              {hasNightShift ? 'День' : 'Ставка'}
            </span>
            <span className="font-medium">{formatCurrency(dayRate, item.currency)}</span>
          </div>
          {hasNightShift && (
            <div className="flex items-center justify-between text-gray-700">
              <span className="inline-flex items-center gap-1">
                <Moon className="h-3.5 w-3.5 text-indigo-500" />
                Ночь
              </span>
              <div className="inline-flex items-center gap-2">
                <span className="font-medium">{formatCurrency(nightRate, item.currency)}</span>
                {!editing && <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-blue-500" />}
              </div>
            </div>
          )}
        </div>
        {editing && (
          <div className="mt-3 flex justify-end">
            <MoveButtons onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
          </div>
        )}
      </div>
    </>
  )
}

function GridToolbar({
  editing,
  dirty,
  pending,
  disabled,
  disabledReason,
  onEdit,
  onCancel,
  onReset,
  onSave,
}: {
  editing: boolean
  dirty: boolean
  pending: boolean
  disabled?: boolean
  disabledReason?: string
  onEdit: () => void
  onCancel: () => void
  onReset: () => void
  onSave: () => void
}) {
  if (!editing) {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="min-h-[40px]" disabled={disabled} title={disabledReason} onClick={onEdit}>
          <GripVertical className="mr-2 h-4 w-4" />
          Редактировать сетку
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" className="min-h-[40px]" disabled={pending || !dirty} onClick={onReset}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Сбросить
      </Button>
      <Button type="button" variant="outline" className="min-h-[40px]" disabled={pending} onClick={onCancel}>
        Отмена
      </Button>
      <Button type="button" className="min-h-[40px]" disabled={pending || !dirty} onClick={onSave}>
        <Save className="mr-2 h-4 w-4" />
        {pending ? 'Сохраняем...' : 'Сохранить порядок'}
      </Button>
    </div>
  )
}

function MoveButtons({
  onMoveUp,
  onMoveDown,
}: {
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  return (
    <div className="inline-flex rounded-full border bg-white p-1">
      <button
        type="button"
        onClick={onMoveUp}
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        aria-label="Поднять выше"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        aria-label="Опустить ниже"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  )
}
