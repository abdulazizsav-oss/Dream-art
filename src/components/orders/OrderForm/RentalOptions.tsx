'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn, formatCurrency, formatDate, getTashkentDate } from '@/lib/utils'
import { DELIVERY_SERVICE_FEE } from '@/lib/delivery'
import { nextCalendarDate } from '@/lib/orders/draft'
import type { OrderFormValues } from '@/lib/validations/order'

export function RentalOptions({ values, onUpdate }: {
  values: Partial<OrderFormValues>
  onUpdate: (patch: Partial<OrderFormValues>) => void
}) {
  const today = getTashkentDate()
  const [showDates, setShowDates] = useState(false)
  const tomorrow = nextCalendarDate(today)
  const invalidRange = !!values.start_date && !!values.end_date && values.end_date < values.start_date
  const quickRanges = [
    { label: 'Сегодня', start: today, end: today },
    { label: 'Сегодня → завтра', start: today, end: tomorrow },
    { label: 'Завтра', start: tomorrow, end: tomorrow },
  ]
  const selectedRange = quickRanges.find(range => range.start === values.start_date && range.end === values.end_date)
  const expandedDates = showDates || invalidRange || !values.start_date || !values.end_date

  return (
    <section aria-labelledby="rental-options-title" className="min-w-0 space-y-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button id="rental-options-title" type="button" aria-expanded={expandedDates} aria-controls="rental-date-fields"
          onClick={() => setShowDates(previous => !previous)} className="min-h-12 text-left">
          <span className="block text-xs text-zinc-500">Период аренды · изменить</span>
          <span className="block text-sm font-semibold">{selectedRange?.label ?? `${values.start_date ? formatDate(values.start_date) : 'Выдача'} — ${values.end_date ? formatDate(values.end_date) : 'Возврат'}`}</span>
        </button>
        <div className="flex flex-wrap gap-2">
          {quickRanges.map(range => (
            <button type="button" key={range.label}
              aria-pressed={values.start_date === range.start && values.end_date === range.end}
              onClick={() => onUpdate({ start_date: range.start, end_date: range.end })}
              className={cn('min-h-11 rounded-xl border px-3 text-sm font-medium active:bg-zinc-100',
                values.start_date === range.start && values.end_date === range.end ? 'border-zinc-900 bg-zinc-900 text-white active:bg-zinc-700' : 'border-zinc-200')}>
              {range.label}
            </button>
          ))}
        </div>
      </div>
      {expandedDates && <div id="rental-date-fields" className="grid grid-cols-2 gap-3 pb-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="rental-start">Выдача</Label>
          <Input id="rental-start" type="date" className="h-12 text-base md:text-base" value={values.start_date ?? ''}
            onInput={e => onUpdate({ start_date: e.currentTarget.value })}
            onChange={e => onUpdate({ start_date: e.target.value })} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="rental-end">Возврат</Label>
          <Input id="rental-end" type="date" className="h-12 text-base md:text-base" value={values.end_date ?? ''} min={values.start_date}
            aria-invalid={invalidRange} aria-describedby={invalidRange ? 'rental-date-error' : undefined}
            onInput={e => onUpdate({ end_date: e.currentTarget.value })}
            onChange={e => onUpdate({ end_date: e.target.value })} />
        </div>
      </div>}
      {invalidRange && <p id="rental-date-error" role="alert" className="text-sm text-red-700">Возврат не может быть раньше выдачи.</p>}
      <div className="space-y-2 border-t border-zinc-100 pb-2 pt-3">
        <h3 className="text-sm font-semibold">Доставка через курьера</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['delivery_to_client', 'Отправить клиенту'],
            ['delivery_from_client', 'Забрать у клиента'],
          ] as const).map(([key, label]) => (
            <button type="button" key={key} aria-pressed={values[key] ?? false} onClick={() => onUpdate({ [key]: !values[key] })}
              className={cn('flex min-h-16 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm', values[key] ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-zinc-200 bg-white text-zinc-700')}>
              <span><span className="block font-medium">{label}</span><span className="mt-0.5 block text-xs">Через курьера · +{formatCurrency(DELIVERY_SERVICE_FEE)}</span></span>
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded border', values[key] ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300')} aria-hidden="true">{values[key] ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </div>
      <details className="border-t border-zinc-100">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
          <span>Депозит и заметка</span>
          <span className="text-zinc-500">{[values.deposit_amount ? 'депозит' : '', values.notes ? 'заметка' : ''].filter(Boolean).join(' · ') || 'Необязательно'} <span aria-hidden="true">⌄</span></span>
        </summary>
        <div className="space-y-4 pb-2 pt-2">
          <p className="text-xs leading-relaxed text-zinc-500">Сумма предварительная. Фактическое время выдачи запишется при создании заказа; окончательный расчёт — при возврате.</p>
          <div className="space-y-1.5">
            <Label htmlFor="rental-deposit">Депозит, UZS</Label>
            <Input id="rental-deposit" type="number" min={0} inputMode="decimal" className="h-12 text-base md:text-base"
              value={values.deposit_amount || ''} placeholder="Без депозита" onChange={e => onUpdate({ deposit_amount: e.target.valueAsNumber || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rental-notes">Заметка</Label>
            <Textarea id="rental-notes" className="min-h-20 text-base md:text-base" rows={2} value={values.notes ?? ''} onChange={e => onUpdate({ notes: e.target.value })} />
          </div>
        </div>
      </details>
    </section>
  )
}
