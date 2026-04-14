import { z } from 'zod'

export const orderItemSchema = z.object({
  equipment_id: z.string().uuid(),
  daily_rate: z.number().min(0),
  days: z.number().min(1),
  subtotal: z.number().min(0),
  condition_on_issue: z.string().default('Хорошее'),
})

export const orderSchema = z.object({
  client_id: z.string().uuid('Выберите клиента'),
  start_date: z.string().min(1, 'Укажите дату начала'),
  end_date: z.string().min(1, 'Укажите дату окончания'),
  deposit_amount: z.coerce.number().min(0).default(0),
  notes: z.string().nullable().optional(),
  items: z.array(orderItemSchema).min(1, 'Добавьте хотя бы одну единицу техники'),
})

export type OrderFormValues = z.infer<typeof orderSchema>
export type OrderItemFormValue = z.infer<typeof orderItemSchema>
