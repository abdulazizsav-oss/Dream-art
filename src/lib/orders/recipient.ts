import { formatClientPhoneInput, normalizeClientPhone } from '@/lib/client-duplicates'

export interface TrustedPersonData {
  name: string
  phone: string
  relation: string
  doc_type: string
}

interface RecipientClient {
  full_name: string
  phone?: string | null
  document_type?: string | null
  trusted_person_name?: string | null
  trusted_person_phone?: string | null
  trusted_person_relation?: string | null
  trusted_person_doc_type?: string | null
}

/** Existing order workflow: a separate contact, not a choice of who collects. */
export function resolveOrderContact(client: RecipientClient): TrustedPersonData {
  return {
    name: client.trusted_person_name ?? client.full_name,
    // Never copy the main phone into the additional contact field.
    phone: formatClientPhoneInput(client.trusted_person_phone),
    relation: client.trusted_person_relation ?? '',
    doc_type: client.trusted_person_doc_type ?? 'passport_id',
  }
}

/** Keep typed draft data, undo only the removed self-pickup autofill. */
export function restoreOrderContact(saved: TrustedPersonData & { pickup_mode?: 'self' | 'other' }, client?: RecipientClient): TrustedPersonData {
  const contact = { name: saved.name, phone: saved.phone, relation: saved.relation, doc_type: saved.doc_type }
  if (saved.pickup_mode === 'self' && client) {
    const stored = resolveOrderContact(client)
    if (saved.name === client.full_name) contact.name = stored.name
    if (normalizeClientPhone(saved.phone) === normalizeClientPhone(client.phone)) contact.phone = stored.phone
  }
  return contact
}

export function getRecipientMissingFields(recipient: TrustedPersonData): string[] {
  const missing: string[] = []
  if (!recipient.name.trim()) missing.push('ФИО дополнительного контакта')
  if (normalizeClientPhone(recipient.phone).length < 9) missing.push('дополнительный телефон полностью')
  if (!recipient.doc_type) missing.push('документ при выдаче')
  return missing
}
