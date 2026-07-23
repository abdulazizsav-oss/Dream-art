import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildClientOrderAlertSummary, getOrderOutstanding } from './client-order-alerts'

const orders = [
  {
    id: 'open-order',
    order_number: 'DA-001',
    status: 'active',
    delivery_fee: 50_000,
    payments: [{ amount: 20_000, payment_type: 'rental' }],
    order_items: [
      { subtotal: 100_000, final_subtotal: null, returned: false, equipment: { name: 'Sony A7' } },
      { subtotal: 30_000, final_subtotal: null, returned: true, equipment: { name: 'Штатив' } },
    ],
  },
  {
    id: 'closed-debt',
    order_number: 'DA-002',
    status: 'returned',
    delivery_fee: 0,
    payments: [{ amount: 20_000, payment_type: 'rental' }, { amount: 50_000, payment_type: 'deposit' }],
    order_items: [{ subtotal: 80_000, final_subtotal: 90_000, returned: true, equipment: { name: 'Lark M2' } }],
  },
]

test('client alert counts only rental payments and includes delivery in remaining debt', () => {
  assert.equal(getOrderOutstanding(orders[0]), 160_000)
  assert.equal(getOrderOutstanding(orders[1]), 70_000)
})

test('client alert shows currently issued equipment and missing accessories', () => {
  const summary = buildClientOrderAlertSummary(orders, {
    total: 2,
    names: ['Крышка', 'Бленда'],
  })

  assert.equal(summary.outstanding_total, 230_000)
  assert.deepEqual(summary.active_equipment, [{
    order_id: 'open-order',
    order_number: 'DA-001',
    equipment_names: ['Sony A7'],
  }])
  assert.deepEqual(summary.missing_accessories.names, ['Крышка', 'Бленда'])
})

