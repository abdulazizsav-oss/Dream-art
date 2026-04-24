'use client'

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

export function StepSummary({ values, clients, equipment, trustedPerson, onBack, onSubmit, submitting }: StepSummaryProps) {
  const client = clients.find(c => c.id === values.client_id)

  const itemsWithDetails = recalculateOrderItems(values.items, equipment, {
    start_date: values.start_date,
    end_date: values.end_date,
  }).map(item => ({
    ...item,
    equipment: equipment.find(e => e.id === item.equipment_id),
  }))

  const total = itemsWithDetails.reduce((s, i) => s + i.subtotal, 0)

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Подтверждение заказа</h2>

      <div className="mb-4">
        <LiveTotal
          startDate={values.start_date}
          endDate={values.end_date}
          startTime={values.start_time}
          endTime={values.end_time}
          items={values.items}
          equipment={equipment}
        />
      </div>

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
          <p className="text-sm text-gray-600">
            {values.start_time} — {values.end_time}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Техника</p>
          <div className="space-y-2">
            {itemsWithDetails.map((item, index) => (
              <div key={`${item.equipment_id}-${index}`} className="flex justify-between text-sm">
                <span>{item.equipment?.name ?? 'Неизвестно'}</span>
                <span className="text-gray-600">
                  {getPricingParts(item)
                    .map(part => `${describeShift(part.shiftType)} · ${formatCurrency(part.rate, item.equipment?.currency)} × ${describeUnits(part.units, part.shiftType)}`)
                    .join(' + ')}
                  {' = '}
                  {formatCurrency(item.subtotal, item.equipment?.currency)}
                </span>
              </div>
            ))}
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
        <Button type="button" onClick={onSubmit} disabled={submitting} className="flex-1">
          {submitting ? 'Создание...' : 'Создать заказ'}
        </Button>
      </div>
    </div>
  )
}
