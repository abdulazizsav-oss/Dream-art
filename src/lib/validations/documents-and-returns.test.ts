import assert from 'node:assert/strict'
import test from 'node:test'
import { DOCUMENT_TYPE_LABELS } from '../utils'
import { clientSchema } from './client'
import { returnMissingKitSchema } from './return-missing'

test('every offered document type is accepted when creating a client', () => {
  for (const document_type of Object.keys(DOCUMENT_TYPE_LABELS)) {
    assert.equal(clientSchema.safeParse({ full_name: 'Тест', phone: '507180400', document_type }).success, true, document_type)
  }
  assert.equal(DOCUMENT_TYPE_LABELS.passport_id_foreign, 'Паспорт ID (иностран)')
  assert.equal(DOCUMENT_TYPE_LABELS.passport_foreign, 'Паспорт (иностран)')
})

test('missing-kit return rejects malformed payloads before the atomic RPC', () => {
  for (const input of [null, {}, { items: [] }, { items: [null] }, { items: [{ order_item_id: 'bad', returned_now: ['Зарядка'] }] }]) {
    assert.equal(returnMissingKitSchema.safeParse(input).success, false)
  }
  const id = '966631d2-9c01-49cb-80a1-782066058b9a'
  assert.equal(returnMissingKitSchema.safeParse({ items: [{ order_item_id: id, returned_now: [' '] }] }).success, false)
  assert.equal(returnMissingKitSchema.safeParse({ items: [{ order_item_id: id, returned_now: ['Зарядка'] }] }).success, true)
})
