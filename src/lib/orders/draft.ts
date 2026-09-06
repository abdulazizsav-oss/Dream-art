import { z } from 'zod'
import { orderItemSchema, type OrderFormValues } from '../validations/order'
import type { TrustedPersonData } from './recipient'

export const ORDER_DRAFT_TTL = 12 * 60 * 60 * 1000

// Drafts deliberately allow unfinished/invalid form fields. Final validation is
// done by orderSchema before POST; a temporarily empty date must not lose a cart.
const date = z.string().refine(value => {
  if (value === '') return true // Native date inputs emit '' while unfinished.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
})
const draftSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().finite(),
  step: z.union([z.literal(0), z.literal(1)]),
  submission: z.enum(['editing', 'submitting', 'uncertain']).default('editing'),
  values: z.object({
    client_id: z.string().uuid().optional(),
    start_date: date,
    end_date: date,
    items: z.array(orderItemSchema).max(500),
    deposit_amount: z.number().finite(),
    notes: z.string().nullable().optional(),
    delivery_to_client: z.boolean(),
    delivery_from_client: z.boolean(),
  }),
  recipient: z.object({
    name: z.string(), phone: z.string(), relation: z.string(), doc_type: z.string(),
    pickup_mode: z.enum(['self', 'other']).optional(),
  }),
})

export function orderDraftKey(userId: string) {
  return `dream-art:order-draft:v1:${userId}`
}

export function encodeOrderDraft(values: Partial<OrderFormValues>, recipient: TrustedPersonData, step: 0 | 1, now = Date.now(), submission: 'editing' | 'submitting' | 'uncertain' = 'editing') {
  return JSON.stringify({ version: 1, savedAt: now, step, values, recipient, submission })
}

/** Per-user, per-tab recovery only. Never restore expired drafts or missing records. */
export function decodeOrderDraft(raw: string | null, clientIds: Set<string>, equipmentIds: Set<string>, now = Date.now()) {
  if (!raw) return null
  try {
    const result = draftSchema.safeParse(JSON.parse(raw))
    if (!result.success) return null
    const draft = result.data
    if (now < draft.savedAt || now - draft.savedAt > ORDER_DRAFT_TTL) return null
    if (draft.values.client_id && !clientIds.has(draft.values.client_id)) return null
    if (draft.values.items.some(item => !equipmentIds.has(item.equipment_id))) return null
    return draft
  } catch {
    return null
  }
}

export function nextCalendarDate(isoDate: string): string {
  const value = new Date(`${isoDate}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}
