'use client'

import { OrderFormValues } from '@/lib/validations/order'
import { Client, Equipment, EquipmentCategory } from '@/types/database'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, calcDays, DOCUMENT_TYPE_LABELS } from '@/lib/utils'
import { TrustedPersonData } from './StepClient'
import { FileText, UserCheck } from 'lucide-react'

interface StepSummaryProps {
  values: OrderFormValues
  clients: Client[]
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
  trustedPerson: TrustedPersonData
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
}

export function StepSummary({ values, clients, equipment, onBack, onSubmit, submitting }: StepSummaryProps) {
  const client = clients.find(c => c.id === values.client_id) as (typeof clients[0] & { document_type?: string }) | undefined
  const DOCUMENT_TYPE_LABELS: Record<string, string> = {
    passport_id: 'Паспорт ID',
    passport_green: 'Паспорт зелёный',
    zagranpassport: 'Загранпаспорт',
    drivers_license: 'Водительские права',
  }
  const days = values.start_date && values.end_date ? calcDays(values.start_date, values.end_date) : 1

  const itemsWithDetails = values.items.map(item => ({
    ...item,
    equipment: equipment.find(e => e.id === item.equipment_id),
    subtotal: item.daily_rate * days,
  }))

  const total = itemsWithDetails.reduce((s, i) => s + i.subtotal, 0)

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Подтверждение заказа</h2>

      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Клиент</p>
          <p className="font-medium">{client?.full_name}</p>
          {client?.phone && <p className="text-sm text-gray-600">{client.phone}</p>}
          {client?.document_type && (
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              {DOCUMENT_TYPE_LABELS[client.document_type] ?? client.document_type}
            </p>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Период</p>
          <p className="font-medium">
            {formatDate(values.start_date)} — {formatDate(values.end_date)}
          </p>
          <p className="text-sm text-gray-600">{days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Техника</p>
          <div className="space-y-2">
            {itemsWithDetails.map(item => (
              <div key={item.equipment_id} className="flex justify-between text-sm">
                <span>{item.equipment?.name ?? 'Неизвестно'}</span>
                <span className="text-gray-600">
                  {formatCurrency(item.daily_rate, item.equipment?.currency) } × {days}д = {formatCurrency(item.subtotal, item.equipment?.currency)}
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
