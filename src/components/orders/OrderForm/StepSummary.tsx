'use client'

import { useEffect, useMemo, useState } from 'react'
import { OrderFormValues } from '@/lib/validations/order'
import { Client, Equipment, EquipmentCategory } from '@/types/database'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, DOCUMENT_TYPE_LABELS } from '@/lib/utils'
import { TrustedPersonData } from './StepClient'
import { FileText, UserCheck } from 'lucide-react'
import { LiveTotal } from './LiveTotal'
import { describeShift, describeUnits, getPricingParts, recalculateOrderItems } from '@/lib/rental'

interface StepSummaryProps {
  values: OrderFormValues
  clients: Client[]
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
  trustedPerson: TrustedPersonData
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
}

type AvailabilityState = Record<string, {
  available: boolean
  message?: string
  order_number?: string
}>

export function StepSummary({ values, clients, equipment, trustedPerson, onBack, onSubmit, submitting }: StepSummaryProps) {
  const [availability, setAvailability] = useState<AvailabilityState>({})
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const client = clients.find(c => c.id === values.client_id)

  const itemsWithDetails = recalculateOrderItems(values.items, equipment, {
    start_date: values.start_date,
    end_date: values.end_date,
  }).map(item => ({
    ...item,
    equipment: equipment.find(e => e.id === item.equipment_id),
  }))

  const unavailableItems = itemsWithDetails.filter(item => availability[item.equipment_id]?.available === false)
  const availableItems = itemsWithDetails.filter(item => availability[item.equipment_id]?.available !== false)
  const total = availableItems.reduce((s, i) => s + i.subtotal, 0)
  const canSubmit = !submitting && !checkingAvailability && unavailableItems.length === 0

  const equipmentIds = useMemo(
    () => Array.from(new Set(values.items.map(item => item.equipment_id))),
    [values.items],
  )

  useEffect(() => {
    if (!values.start_date || !values.end_date || equipmentIds.length === 0) return

    let cancelled = false
    setCheckingAvailability(true)

    fetch('/api/equipment/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        equipment_ids: equipmentIds,
        start_date: values.start_date,
        end_date: values.end_date,
      }),
    })
      .then(res => res.ok ? res.json() : Promise.reject(new Error('availability failed')))
      .then((payload: { results?: AvailabilityState }) => {
        if (!cancelled) setAvailability(payload.results ?? {})
      })
      .catch(() => {
        if (!cancelled) setAvailability({})
      })
      .finally(() => {
        if (!cancelled) setCheckingAvailability(false)
      })

    return () => {
      cancelled = true
    }
  }, [equipmentIds, values.end_date, values.start_date])

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Подтверждение заказа</h2>

      <div className="mb-4">
        <LiveTotal
          startDate={values.start_date}
          endDate={values.end_date}
          items={availableItems}
          equipment={equipment}
        />
      </div>

      {unavailableItems.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">Нужно убрать занятую технику перед созданием заказа</p>
          <div className="mt-2 space-y-1">
            {unavailableItems.map(item => (
              <p key={item.equipment_id}>
                {availability[item.equipment_id]?.message ?? `${item.equipment?.name ?? 'Техника'} недоступна на выбранные даты`}
              </p>
            ))}
          </div>
          <p className="mt-2 text-xs text-red-600">
            Эти позиции не входят в предварительный итог выше.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Клиент</p>
          <p className="font-medium">{client?.full_name}</p>
          {client?.phone && <p className="text-sm text-gray-600">{client.phone}</p>}
        </div>

        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-xs text-blue-500 mb-1.5 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" />
            Доверенное лицо
          </p>
          <p className="font-medium text-gray-900">{trustedPerson.name}</p>
          {trustedPerson.relation && (
            <p className="text-xs text-gray-500 mt-0.5">{trustedPerson.relation}</p>
          )}
          {trustedPerson.phone && (
            <p className="text-sm text-gray-600 mt-0.5">{trustedPerson.phone}</p>
          )}
          {trustedPerson.doc_type && (
            <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-1">
              <FileText className="w-3.5 h-3.5" />
              {DOCUMENT_TYPE_LABELS[trustedPerson.doc_type] ?? trustedPerson.doc_type}
            </p>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Период</p>
          <p className="font-medium">
            {formatDate(values.start_date)} — {formatDate(values.end_date)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Время выдачи/возврата — фактические, фиксируются автоматически
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Техника</p>
          <div className="space-y-2">
            {itemsWithDetails.map(item => {
              const unavailable = availability[item.equipment_id]?.available === false
              return (
              <div key={item.equipment_id} className="flex justify-between gap-3 text-sm">
                <span className={unavailable ? 'text-red-700' : undefined}>
                  {item.equipment?.name ?? 'Неизвестно'}
                  {unavailable && <span className="ml-2 text-xs font-medium">(занята)</span>}
                </span>
                <span className={unavailable ? 'text-red-600 line-through decoration-red-500' : 'text-gray-600'}>
                  {getPricingParts(item)
                    .map(part => `${describeShift(part.shiftType)} · ${formatCurrency(part.rate, item.equipment?.currency)} × ${describeUnits(part.units, part.shiftType)}`)
                    .join(' + ')}
                  {' = '}
                  {formatCurrency(item.subtotal, item.equipment?.currency)}
                </span>
              </div>
              )
            })}
          </div>
        </div>

        <div className="border-t pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Итого аренда</span>
            <span className="font-semibold">{formatCurrency(total)}</span>
          </div>
          {(values.deposit_amount ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Депозит</span>
              <span>{formatCurrency(values.deposit_amount ?? 0)}</span>
            </div>
          )}
          {values.notes && (
            <p className="text-xs text-gray-400 mt-2">Заметка: {values.notes}</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Назад
        </Button>
        <Button type="button" onClick={onSubmit} disabled={!canSubmit} className="flex-1">
          {submitting ? 'Создание...' : checkingAvailability ? 'Проверяем технику...' : 'Создать заказ'}
        </Button>
      </div>
    </div>
  )
}
