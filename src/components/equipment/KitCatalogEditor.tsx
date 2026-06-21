'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { KitComponent } from '@/lib/kit'

interface KitCatalogEditorProps {
  value: KitComponent[]
  onChange: (kit: KitComponent[]) => void
  suggestions?: string[]
}

const EMPTY: KitComponent = { name: '', price: 0, default_qty: 1, max_qty: 1 }

/**
 * Редактор каталога комплекта техники: название, цена за смену, кол-во по
 * умолчанию и максимум. Цена 0 = входит в базовую цену; >0 = платный доп.
 */
export function KitCatalogEditor({ value, onChange, suggestions = [] }: KitCatalogEditorProps) {
  const [draft, setDraft] = useState('')

  function update(index: number, patch: Partial<KitComponent>) {
    onChange(value.map((row, i) => {
      if (i !== index) return row
      const next = { ...row, ...patch }
      // max_qty не меньше 1; default_qty в диапазоне 0..max_qty
      next.max_qty = Math.max(1, Math.floor(Number(next.max_qty) || 1))
      next.default_qty = Math.min(next.max_qty, Math.max(0, Math.floor(Number(next.default_qty) || 0)))
      next.price = Math.max(0, Number(next.price) || 0)
      return next
    }))
  }

  function add(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (value.some(r => r.name.trim().toLowerCase() === trimmed.toLowerCase())) return
    onChange([...value, { ...EMPTY, name: trimmed }])
    setDraft('')
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  const availableSuggestions = suggestions.filter(
    s => !value.some(r => r.name.trim().toLowerCase() === s.toLowerCase()),
  )

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="space-y-2">
          {/* Заголовки колонок (desktop) */}
          <div className="hidden sm:grid grid-cols-[1fr_120px_84px_84px_40px] gap-2 px-1 text-[11px] font-medium text-gray-400">
            <span>Компонент</span>
            <span>Цена/смена</span>
            <span>По умолч.</span>
            <span>Макс.</span>
            <span />
          </div>
          {value.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-2 sm:grid-cols-[1fr_120px_84px_84px_40px] gap-2 items-center rounded-xl border bg-zinc-50/60 p-2 sm:p-1.5"
            >
              <Input
                value={row.name}
                onChange={e => update(index, { name: e.target.value })}
                placeholder="Название"
                className="col-span-2 sm:col-span-1 min-h-[40px]"
              />
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={row.price}
                onChange={e => update(index, { price: Number(e.target.value) })}
                placeholder="0 = входит"
                className="min-h-[40px]"
                aria-label="Цена за смену"
              />
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={row.default_qty}
                onChange={e => update(index, { default_qty: Number(e.target.value) })}
                className="min-h-[40px]"
                aria-label="Количество по умолчанию"
              />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={row.max_qty}
                onChange={e => update(index, { max_qty: Number(e.target.value) })}
                className="min-h-[40px]"
                aria-label="Максимальное количество"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="justify-self-end rounded-full p-2 text-zinc-400 hover:bg-white hover:text-red-500 transition-colors"
                aria-label="Удалить компонент"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {row.price > 0 && (
                <p className="col-span-2 sm:hidden text-[11px] text-blue-600">
                  Платный: {formatCurrency(row.price)} / смена × до {row.max_qty} шт.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Добавление компонента */}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }}
          placeholder="Добавить компонент…"
          className="min-h-[40px]"
        />
        <Button type="button" variant="outline" onClick={() => add(draft)} disabled={!draft.trim()} className="min-h-[40px] shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Добавить
        </Button>
      </div>

      {availableSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-400 self-center">Быстрый выбор:</span>
          {availableSuggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-xs text-gray-600 transition-colors"
            >
              <Plus className="w-3 h-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
