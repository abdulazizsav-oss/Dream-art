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
  /**
   * Ручная цена позиции. Если задана — итог по позиции «замораживается» на этой
   * сумме и не пересчитывается ни в preview, ни при закрытии заказа.
   * null/undefined — авто-расчёт по сменам.
   */
  manual_subtotal: z.number().min(0).nullable().optional(),
  condition_on_issue: z.string().default('Хорошее'),
  selected_kit_items: z.array(z.string()).default([]).optional(),
  /**
   * Выбранный комплект с количеством и ценой за смену. Источник истины для
   * платного комплекта; selected_kit_items выводятся из него (имена-единицы).
   */
  kit_selection: z.array(z.object({
    name: z.string(),
    qty: z.number().int().min(0),
    unit_price: z.number().min(0),
  })).default([]).optional(),
})

const normalizedOrderSchema = z.object({
  client_id: z.string().uuid('Выберите клиента'),
  start_date: isoDateSchema('Укажите дату начала'),
  end_date: isoDateSchema('Укажите дату окончания'),
  deposit_amount: z.coerce.number().min(0).default(0),
  notes: z.string().nullable().optional(),
  trusted_person: z.string().nullable().optional(),
  trusted_person_doc_type: z.string().nullable().optional(),
  fulfillment_method: z.enum(['pickup', 'delivery']),
  delivery_address: z.string()
    .trim()
    .min(1, 'Укажите адрес доставки')
    .max(500, 'Адрес не должен быть длиннее 500 символов')
    .nullable()
    .default(null),
  delivery_fee: z.number({ error: 'Укажите стоимость доставки' })
    .int('Стоимость доставки должна быть целым числом')
    .min(0, 'Стоимость доставки не может быть отрицательной'),
  items: z.array(orderItemSchema).min(1, 'Добавьте хотя бы одну единицу техники'),
}).superRefine((data, ctx) => {
  if (data.end_date < data.start_date) {
    ctx.addIssue({
      code: 'custom',
      message: 'Дата окончания не может быть раньше даты начала',
      path: ['end_date'],
    })
  }

  if (data.fulfillment_method === 'delivery' && data.delivery_address === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Укажите адрес доставки',
      path: ['delivery_address'],
    })
  }
})

/**
 * Старые клиенты не передают способ получения. Считаем их самовывозом
 * и на границе схемы обнуляем поля доставки, чтобы они не попали в payload.
 * Для delivery поле delivery_fee намеренно не имеет default: менеджер должен ввести
 * стоимость явно, в том числе 0 для бесплатной доставки.
 */
export const orderSchema = z.preprocess(input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input

  const raw = input as Record<string, unknown>
  const method = raw.fulfillment_method ?? 'pickup'
  if (method !== 'pickup') return input

  return {
    ...raw,
    fulfillment_method: 'pickup',
    delivery_address: null,
    delivery_fee: 0,
  }
}, normalizedOrderSchema)

export type OrderFormValues = z.infer<typeof orderSchema>
export type OrderItemFormValue = z.infer<typeof orderItemSchema>
