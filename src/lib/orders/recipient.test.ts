import assert from 'node:assert/strict'
import test from 'node:test'
import { getRecipientMissingFields, resolveOrderContact, restoreOrderContact } from './recipient'

const client = {
  full_name: 'Бегзод', phone: '507180400', document_type: 'passport_id_foreign',
  trusted_person_name: 'Алексей', trusted_person_phone: '901234567', trusted_person_relation: 'Коллега',
}

test('order contact uses the stored additional contact, not the main phone', () => {
  assert.deepEqual(resolveOrderContact(client), {
    name: 'Алексей', phone: '+998 90 123-45-67', relation: 'Коллега', doc_type: 'passport_id',
  })
  assert.deepEqual(getRecipientMissingFields(resolveOrderContact(client)), [])
})

test('missing additional phone stays empty and requires input even with a main phone', () => {
  const contact = resolveOrderContact({ full_name: 'Клиент', phone: '507180400' })
  assert.equal(contact.name, 'Клиент')
  assert.equal(contact.phone, '')
  assert.deepEqual(getRecipientMissingFields(contact), ['дополнительный телефон полностью'])
})

test('switching clients resets contact and document instead of inheriting previous values', () => {
  assert.equal(resolveOrderContact({ ...client, trusted_person_doc_type: 'passport_foreign' }).doc_type, 'passport_foreign')
  const next = resolveOrderContact({ full_name: 'Новый клиент', phone: '507180400' })
  assert.equal(next.doc_type, 'passport_id')
  assert.equal(next.phone, '')
  assert.equal(next.relation, '')
})

test('legacy self-pickup draft restores separate contact and removes pickup mode', () => {
  const restored = restoreOrderContact({ name: client.full_name, phone: '+998 50 718-04-00', relation: '', doc_type: 'passport_id', pickup_mode: 'self' }, client)
  assert.equal(restored.name, 'Алексей')
  assert.equal(restored.phone, '+998 90 123-45-67')
  assert.equal('pickup_mode' in restored, false)
})

test('draft restoration preserves manually entered contact details', () => {
  const saved = { name: 'Коллега', phone: '+998 90 555-22-11', relation: 'Ассистент', doc_type: 'passport_foreign' }
  assert.deepEqual(restoreOrderContact(saved, client), saved)
  assert.deepEqual(restoreOrderContact({ ...saved, pickup_mode: 'self' }, client), saved)
})
