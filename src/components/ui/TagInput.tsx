'use client'

import { useState, KeyboardEvent } from 'react'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { expandKitUnits } from '@/lib/kit'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  suggestions?: string[]
  className?: string
  disabled?: boolean
  /**
   * Режим количества: рядом с полем появляется числовой ввод. При добавлении
   * элемент с кол-вом N>1 разворачивается в пронумерованные единицы
   * («Батарея ×2» → «Батарея 1», «Батарея 2»).
   */
  enableQuantity?: boolean
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Добавить и нажать Enter',
  suggestions = [],
  className,
  disabled,
  enableQuantity = false,
}: TagInputProps) {
  const [draft, setDraft] = useState('')
  const [qty, setQty] = useState(1)

  function addTags(tags: string[]) {
    const next = [...value]
    for (const tag of tags) {
      const trimmed = tag.trim()
      if (trimmed && !next.includes(trimmed)) next.push(trimmed)
    }
    if (next.length !== value.length) onChange(next)
    setDraft('')
    setQty(1)
  }

  function commitDraft() {
    addTags(enableQuantity ? expandKitUnits(draft, qty) : [draft])
  }

  function removeTag(tag: string) {
    onChange(value.filter(t => t !== tag))
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const availableSuggestions = suggestions.filter(s => !value.includes(s))

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 min-h-[44px] rounded-md border border-input bg-background px-2 py-1.5 text-sm',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        {value.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:bg-blue-100 rounded-full w-4 h-4 flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => { if (!enableQuantity) commitDraft() }}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-gray-400 py-1"
        />
        {enableQuantity && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">×</span>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              disabled={disabled}
              aria-label="Количество"
              className="w-12 rounded-md border border-input bg-background px-1.5 py-1 text-center text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={commitDraft}
              disabled={disabled || !draft.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              <Plus className="w-3 h-3" />
              Добавить
            </button>
          </div>
        )}
      </div>

      {availableSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-400 self-center">Быстрый выбор:</span>
          {availableSuggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addTags(enableQuantity ? expandKitUnits(s, qty) : [s])}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-xs text-gray-600 transition-colors"
            >
              <Plus className="w-3 h-3" />
              {s}{enableQuantity && qty > 1 ? ` ×${qty}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
