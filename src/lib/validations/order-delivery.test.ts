import assert from 'node:assert/strict'
import test from 'node:test'
import { orderSchema } from './order'

const validOrder = {
  client_id: '1c55ae4b-bdce-4bda-9189-bf67e1d7a769',
  start_date: '2026-06-13',
  end_date: '2026-06-14',
  deposit_amount: 0,
  items: [{
    equipment_id: '74234787-fb59-43b2-b7fb-1b50a2c9d86f',
    daily_rate: 100_000,
    days: 1,
    subtotal: 100_000,
  }],
}

test('legacy order is normalized to pickup without delivery fields', () => {
  const result = orderSchema.safeParse(validOrder)

  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.fulfillment_method, 'pickup')
    assert.equal(result.data.delivery_address, null)
    assert.equal(result.data.delivery_fee, 0)
  }
})

test('pickup discards stale delivery values', () => {
  const result = orderSchema.safeParse({
    ...validOrder,
    fulfillment_method: 'pickup',
    delivery_address: '  старый адрес  ',
    delivery_fee: 50_000,
  })

  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.delivery_address, null)
    assert.equal(result.data.delivery_fee, 0)
  }
})

test('delivery accepts an explicitly entered zero fee and trims address', () => {
  const result = orderSchema.safeParse({
    ...validOrder,
    fulfillment_method: 'delivery',
    delivery_address: '  Ташкент, ул. Навои, 1  ',
    delivery_fee: 0,
  })

  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.delivery_address, 'Ташкент, ул. Навои, 1')
    assert.equal(result.data.delivery_fee, 0)
  }
})

test('delivery requires an explicitly entered fee', () => {
  const result = orderSchema.safeParse({
    ...validOrder,
    fulfillment_method: 'delivery',
    delivery_address: 'Ташкент, ул. Навои, 1',
  })

  assert.equal(result.success, false)
  if (!result.success) {
    assert.equal(result.error.issues.some(issue => issue.path.join('.') === 'delivery_fee'), true)
  }
})

test('delivery rejects a blank address and a fractional or negative fee', () => {
  for (const deliveryFee of [-1, 1.5]) {
    const result = orderSchema.safeParse({
      ...validOrder,
      fulfillment_method: 'delivery',
      delivery_address: '   ',
      delivery_fee: deliveryFee,
    })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.error.issues.some(issue => issue.path.join('.') === 'delivery_address'), true)
      assert.equal(result.error.issues.some(issue => issue.path.join('.') === 'delivery_fee'), true)
    }
  }
})
