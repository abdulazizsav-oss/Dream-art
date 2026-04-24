'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { OrderFormValues } from '@/lib/validations/order'
import { Client, Equipment, EquipmentCategory } from '@/types/database'
import { StepClient, TrustedPersonData } from './StepClient'
import { StepEquipment } from './StepEquipment'
import { StepDates } from './StepDates'
import { StepSummary } from './StepSummary'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { recalculateOrderItems } from '@/lib/rental'

interface OrderFormProps {
  clients: Client[]
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
}

const STEPS = ['Клиент', 'Техника', 'Даты', 'Итог']

export function OrderForm({ clients: initialClients, equipment }: OrderFormProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [allClients, setAllClients] = useState<Client[]>(initialClients)
  const [values, setValues] = useState<Partial<OrderFormValues>>({
    items: [],
    deposit_amount: 0,
  })
  const [trustedPerson, setTrustedPerson] = useState<TrustedPersonData>({
    name: '',
    phone: '',
    relation: '',
    doc_type: 'passport_id',
  })
  const [submitting, setSubmitting] = useState(false)

  function update(patch: Partial<OrderFormValues>) {
    setValues(prev => {
      const next = { ...prev, ...patch }
      if (patch.items || patch.start_date || patch.end_date) {
        next.items = recalculateOrderItems(next.items ?? [], equipment, {
          start_date: next.start_date,
          end_date: next.end_date,
        })
      }
      return next
    })
  }

  async function submit() {
    setSubmitting(true)
    const recalculatedItems = recalculateOrderItems(values.items ?? [], equipment, {
      start_date: values.start_date,
      end_date: values.end_date,
    })
    // Формируем строку: "Иван Иванов (Брат) +998901234567"
    const tpParts = [
      trustedPerson.name,
      trustedPerson.relation ? `(${trustedPerson.relation})` : null,
      trustedPerson.phone || null,
    ].filter(Boolean).join(' ')

    const payload = {
      ...values,
      trusted_person: tpParts || null,
      trusted_person_doc_type: trustedPerson.doc_type || null,
      items: recalculatedItems,
    }
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Ошибка создания заказа')
      setSubmitting(false)
      return
    }
    const order = await res.json()
    toast.success(`Заказ ${order.order_number} создан`)
    router.push(`/orders/${order.id}`)
    router.refresh()
  }

  return (
    <div className="max-w-6xl">
      {/* Progress */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
              i < step ? 'bg-blue-600 text-white' :
              i === step ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
              'bg-gray-100 text-gray-400'
            )}>
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={cn('text-sm', i === step ? 'font-medium' : 'text-gray-400')}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-4 md:p-6">
        {step === 0 && (
          <StepClient
            clients={allClients}
            selectedClientId={values.client_id}
            trustedPerson={trustedPerson}
            onSelect={id => update({ client_id: id })}
            onTrustedPersonChange={setTrustedPerson}
            onClientCreated={client => setAllClients(prev => [...prev, client])}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <StepEquipment
            equipment={equipment}
            startDate={values.start_date}
            endDate={values.end_date}
            startTime={values.start_time}
            endTime={values.end_time}
            selectedItems={values.items ?? []}
            onUpdate={items => update({ items })}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <StepDates
            startDate={values.start_date ?? ''}
            endDate={values.end_date ?? ''}
            startTime={values.start_time ?? DEFAULT_START_TIME}
            endTime={values.end_time ?? DEFAULT_END_TIME}
            depositAmount={values.deposit_amount ?? 0}
            notes={values.notes ?? ''}
            selectedItems={values.items ?? []}
            equipment={equipment}
            onUpdate={patch => update(patch)}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <StepSummary
            values={values as OrderFormValues}
            clients={allClients}
            equipment={equipment}
            trustedPerson={trustedPerson}
            onBack={() => setStep(2)}
            onSubmit={submit}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  )
}
