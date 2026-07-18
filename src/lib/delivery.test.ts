import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateDeliveryFee, deliveryServiceCount } from './delivery'

test('each delivery direction costs 50 000 UZS', () => {
  assert.equal(calculateDeliveryFee({ delivery_to_client: true, delivery_from_client: false }), 50_000)
  assert.equal(calculateDeliveryFee({ delivery_to_client: false, delivery_from_client: true }), 50_000)
})

test('two directions cost 100 000 UZS and no service costs zero', () => {
  assert.equal(calculateDeliveryFee({ delivery_to_client: true, delivery_from_client: true }), 100_000)
  assert.equal(calculateDeliveryFee({ delivery_to_client: false, delivery_from_client: false }), 0)
  assert.equal(deliveryServiceCount({ delivery_to_client: true, delivery_from_client: true }), 2)
})
