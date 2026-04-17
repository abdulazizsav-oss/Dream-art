import { z } from 'zod'

export const equipmentSchema = z.object({
  name: z.string().min(1, 'Название обязательно'),
  category_id: z.string().uuid('Выберите категорию').nullable().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  daily_rate: z.coerce.number().min(0, 'Ставка аренды обязательна'),
  currency: z.enum(['UZS', 'USD']).default('UZS'),
  brand: z.preprocess(v => v === '' ? null : v, z.string().nullable().optional()),
  specs: z.preprocess(v => v === '' ? null : v, z.string().nullable().optional()),
  serial_number: z.preprocess(v => v === '' ? null : v, z.string().nullable().optional()),
  purchase_cost: z.coerce.number().nullable().optional(),
  photo_url: z.preprocess(
    v => v === '' ? null : v,
    z.string().url('Укажите корректную ссылку').nullable().optional()
  ),
  notes: z.preprocess(v => v === '' ? null : v, z.string().nullable().optional()),
  source: z.preprocess(v => v === '' ? null : v, z.string().nullable().optional()),
  sort_order: z.coerce.number().int().min(0).default(0).optional(),
})

export type EquipmentFormInput = z.input<typeof equipmentSchema>
export type EquipmentFormValues = z.output<typeof equipmentSchema>
