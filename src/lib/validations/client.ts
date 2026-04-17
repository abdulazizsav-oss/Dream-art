import { z } from 'zod'

export const clientSchema = z.object({
  full_name: z.string().min(1, 'ФИО обязательно'),
  phone: z.string().nullable().optional(),
  telegram_username: z.string().nullable().optional(),
  passport_series: z.string().nullable().optional(),
  passport_number: z.string().nullable().optional(),
  passport_issued_by: z.string().nullable().optional(),
  passport_issued_date: z.string().nullable().optional(),
  deposit_held: z.coerce.number().min(0).default(0),
  reliability_rating: z.coerce.number().min(1).max(5).default(3),
  segment: z.enum(['photographer','videographer','studio','agency','one_time','other']).default('other'),
  document_type: z.enum(['passport_id','passport_green','zagranpassport','passport_cover','drivers_license']).default('passport_id'),
  birth_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type ClientFormInput = z.input<typeof clientSchema>
export type ClientFormValues = z.output<typeof clientSchema>
