import { z } from 'zod'

export const equipmentSchema = z.object({
  name: z.string().min(1, 'Название обязательно'),
  category_id: z.string().uuid('Выберите категорию').nullable().optional(),
  serial_number: z.string().nullable().optional(),
  purchase_cost: z.coerce.number().min(0).nullable().optional(),
  daily_rate: z.coerce.number().min(0, 'Ставка аренды обязательна'),
  status: z.enum(['free', 'rented', 'maintenance', 'lost']).default('free'),
  notes: z.string().nullable().optional(),
})

export type EquipmentFormValues = z.infer<typeof equipmentSchema>
