import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeOrderDraft, encodeOrderDraft, nextCalendarDate, orderDraftKey, ORDER_DRAFT_TTL } from './draft'

const clientId = '11111111-1111-4111-8111-111111111111'
const eqId = '22222222-2222-4222-8222-222222222222'
const values = { client_id: clientId, start_date: '2026-09-06', end_date: '2026-09-06', deposit_amount: 0, delivery_to_client: false, delivery_from_client: false, items: [] }
const recipient = { name: 'Test', phone: '+998 50 718-04-00', relation: '', doc_type: 'passport_id' }
const clients = new Set([clientId])
const equipment = new Set([eqId])

test('tablet draft restores values, recipient and wizard step without recalculating persisted data', () => {
  const draft = decodeOrderDraft(encodeOrderDraft(values, recipient, 1, 100), clients, equipment, 200)
  assert.deepEqual(draft?.values, values)
  assert.deepEqual(draft?.recipient, recipient)
  assert.equal(draft?.step, 1)
})
test('draft rejects invalid JSON, expired/future saves, missing client and equipment', () => {
  assert.equal(decodeOrderDraft('{', clients, equipment), null)
  const raw = encodeOrderDraft(values, recipient, 0, 100)
  assert.equal(decodeOrderDraft(raw, clients, equipment, 100 + ORDER_DRAFT_TTL + 1), null)
  assert.equal(decodeOrderDraft(raw, clients, equipment, 99), null)
  assert.equal(decodeOrderDraft(raw, new Set(), equipment, 200), null)
  const withItem = encodeOrderDraft({ ...values, items: [{ equipment_id: eqId, daily_rate: 10, days: 1, subtotal: 10 } as never] }, recipient, 0, 100)
  assert.equal(decodeOrderDraft(withItem, clients, new Set(), 200), null)
})
test('draft keeps unfinished inputs and uncertain submission across refresh', () => {
  const draft = decodeOrderDraft(encodeOrderDraft({ ...values, end_date: '', deposit_amount: -1 }, recipient, 1, 100, 'submitting'), clients, equipment, 200)
  assert.equal(draft?.values.end_date, '')
  assert.equal(draft?.values.deposit_amount, -1)
  assert.equal(draft?.submission, 'submitting')
  assert.equal(decodeOrderDraft(encodeOrderDraft(values, recipient, 1, 100, 'uncertain'), clients, equipment, 200)?.submission, 'uncertain')
})
test('draft storage is scoped to administrator; tomorrow respects calendar boundaries', () => {
  assert.notEqual(orderDraftKey('admin-a'), orderDraftKey('admin-b'))
  assert.equal(nextCalendarDate('2026-09-30'), '2026-10-01')
  assert.equal(nextCalendarDate('2026-12-31'), '2027-01-01')
  assert.equal(nextCalendarDate('2028-02-28'), '2028-02-29')
})
