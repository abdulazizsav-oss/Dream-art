import { z } from 'zod'
import { formatClientPhoneInput, normalizeClientPhone } from '@/lib/client-duplicates'

const optionalPhoneSchema = z.preprocess(
  value => value === '' ? null : value,
  z.string()
    .transform(formatClientPhoneInput)
    .refine(value => normalizeClientPhone(value).length >= 9, 'Укажите номер полностью')
    .nullable()
    .optional(),
)

export const clientSchema = z.object({
  full_name: z.string().min(1, 'ФИО обязательно'),
  phone: z.string()
    .min(1, 'Укажите номер телефона')
    .transform(formatClientPhoneInput)
    .refine(value => normalizeClientPhone(value).length >= 9, 'Укажите номер полностью'),
  // Контакты (email/telegram/instagram/facebook)
  email: z.preprocess(v => v === '' ? null : v, z.string().email('Некорректный email').nullable().optional()),
  telegram_username: z.string().nullable().optional(),
  instagram_username: z.string().nullable().optional(),
  facebook_username: z.string().nullable().optional(),
  // Адреса
  address_actual: z.string().nullable().optional(),
  address_registered: z.string().nullable().optional(),
  // Фото клиента
  photo_url: z.preprocess(v => v === '' ? null : v, z.string().url().nullable().optional()),
  // Паспорт
  passport_series: z.string().nullable().optional(),
  passport_number: z.string().nullable().optional(),
  passport_issued_by: z.string().nullable().optional(),
  passport_issued_date: z.string().nullable().optional(),
  deposit_held: z.coerce.number().min(0).default(0),
  reliability_rating: z.coerce.number().min(1).max(5).default(3),
  segment: z.enum(['photographer','videographer','studio','agency','one_time','other']).default('other'),
  document_type: z.enum(['passport_id','passport_green','zagranpassport','passport_cover','drivers_license','passport_id_foreign','passport_foreign']).default('passport_id'),
  birth_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Доверенное лицо — хранится на карточке клиента
  trusted_person_name: z.string().nullable().optional(),
  trusted_person_phone: optionalPhoneSchema,
  trusted_person_relation: z.string().nullable().optional(),
})

export type ClientFormInput = z.input<typeof clientSchema>
export type ClientFormValues = z.output<typeof clientSchema>
