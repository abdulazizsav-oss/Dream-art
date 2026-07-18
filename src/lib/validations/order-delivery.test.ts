import assert from 'node:assert/strict'
import test from 'node:test'
import { orderSchema } from './order'

const baseOrder = {
  client_id: '00000000-0000-4000-8000-000000000001',
  start_date: '2026-07-18',
  end_date: '2026-07-18',
  items: [{
    equipment_id: '00000000-0000-4000-8000-000000000002',
    daily_rate: 100_000,
    days: 1,
    subtotal: 100_000,
  }],
}

test('new order defaults to no delivery services', () => {
  const result = orderSchema.safeParse(baseOrder)
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.delivery_to_client, false)
    assert.equal(result.data.delivery_from_client, false)
  }
})

test('both fixed delivery services are accepted independently', () => {
  const result = orderSchema.safeParse({
    ...baseOrder,
    delivery_to_client: true,
    delivery_from_client: true,
  })
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.delivery_to_client, true)
    assert.equal(result.data.delivery_from_client, true)
  }
})

test('legacy delivery payload becomes the outbound service', () => {
  const result = orderSchema.safeParse({
    ...baseOrder,
    fulfillment_method: 'delivery',
    delivery_address: 'Старый адрес',
    delivery_fee: 75_000,
  })
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.delivery_to_client, true)
    assert.equal(result.data.delivery_from_client, false)
  }
})
