import { z } from 'zod'

const isoDateSchema = (requiredMessage: string) => z.string()
  .min(1, requiredMessage)
  .refine(value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Укажите корректную дату')

export const orderItemSchema = z.object({
  equipment_id: z.string().uuid(),
  daily_rate: z.number().min(0),
  days: z.number().min(1),
  subtotal: z.number().min(0),
  shift_type: z.enum(['day', 'night']).default('day'),
  rate_source: z.enum(['auto', 'manual']).default('auto'),
  day_rate_snapshot: z.number().min(0).default(0),
  night_rate_snapshot: z.number().min(0).default(0),
  day_units: z.number().int().min(0).default(0),
  night_units: z.number().int().min(0).default(0),
  condition_on_issue: z.string().default('Хорошее'),
  selected_kit_items: z.array(z.string()).default([]).optional(),
})

export const orderSchema = z.object({
  client_id: z.string().uuid('Выберите клиента'),
  start_date: isoDateSchema('Укажите дату начала'),
  end_date: isoDateSchema('Укажите дату окончания'),
  deposit_amount: z.coerce.number().min(0).default(0),
  notes: z.string().nullable().optional(),
  trusted_person: z.string().nullable().optional(),
  trusted_person_doc_type: z.string().nullable().optional(),
  items: z.array(orderItemSchema).min(1, 'Добавьте хотя бы одну единицу техники'),
}).refine(
  data => data.end_date >= data.start_date,
  {
    message: 'Дата окончания не может быть раньше даты начала',
    path: ['end_date'],
  },
)

export type OrderFormValues = z.infer<typeof orderSchema>
export type OrderItemFormValue = z.infer<typeof orderItemSchema>
