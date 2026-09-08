import assert from 'node:assert/strict'
import test from 'node:test'
import { cancellationBalance, cancellationSchema, cancellationRefundSchema, signedPaymentAmount } from './cancellation'
import { orderDraftKey } from './draft'
import { clientSchema } from '../validations/client'

test('cancellation keeps deposit separate and subtracts already recorded refunds', () => {
  const payments = [
    { payment_type: 'rental', amount: 100.1 }, { payment_type: 'rental', amount: 50.2 },
    { payment_type: 'refund', amount: 40.1 }, { payment_type: 'deposit', amount: 200 },
    { payment_type: 'deposit_return', amount: 50 },
  ]
  assert.deepEqual(cancellationBalance(payments), { rentalDue: 110.2, depositDue: 150, refunded: 90.1 })
  assert.equal(signedPaymentAmount(payments[2]), -40.1)
  assert.equal(signedPaymentAmount(payments[4]), -50)
  assert.deepEqual(cancellationBalance([]), { rentalDue: 0, depositDue: 0, refunded: 0 })
})
test('cancellation needs an explicit physical return and reason', () => {
  assert.equal(cancellationSchema.safeParse({ reason: ' ', all_returned: true, items: [] }).success, false)
  assert.equal(cancellationSchema.safeParse({ reason: 'Другая техника', all_returned: false, items: [] }).success, false)
  assert.equal(cancellationSchema.safeParse({ reason: 'Другая техника', all_returned: true, items: [] }).success, true)
})
test('refund requires a retry ID, a positive cents amount and a refund type', () => {
  const base = { request_id: '966631d0-6f2b-4031-a997-ef6cf481bb07', amount: 10, payment_type: 'refund', payment_method: 'cash' }
  assert.equal(cancellationRefundSchema.safeParse(base).success, true)
  for (const patch of [{ request_id: '' }, { amount: -1 }, { amount: 0 }, { amount: 1.001 }, { payment_type: 'rental' }]) {
    assert.equal(cancellationRefundSchema.safeParse({ ...base, ...patch }).success, false)
  }
})
test('new order from a client never restores another client’s draft', () => {
  assert.notEqual(orderDraftKey('admin', 'client-a'), orderDraftKey('admin', 'client-b'))
  assert.notEqual(orderDraftKey('admin', 'client-a'), orderDraftKey('admin'))
})
test('editing a client clears empty dates and trims the name', () => {
  const parsed = clientSchema.parse({ full_name: '  Азиз  ', phone: '901234567', birth_date: '', passport_issued_date: '' })
  assert.equal(parsed.full_name, 'Азиз')
  assert.equal(parsed.birth_date, null)
  assert.equal(parsed.passport_issued_date, null)
})
