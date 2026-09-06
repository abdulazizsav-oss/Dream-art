import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTashkentDate } from '../billing'
import { matchesOrderSearch, matchesQueue, normalizeOrder } from './list'

const start = buildTashkentDate('2026-09-06', '11:00').toISOString()
const now = buildTashkentDate('2026-09-06', '15:00')
function fixture() {
  return {
    id: 'order-1', order_number: 'DA-2026-0321', status: 'active',
    start_date: '2026-09-06', end_date: '2026-09-06', actual_start_at: start,
    clients: { full_name: 'Бегзод', phone: '+998 50 718-04-00' },
    total_amount: 100000, delivery_fee: 0, payments: [],
    order_items: [{
      id: 'item-1', equipment_id: 'equipment-1', actual_start_at: start,
      actual_end_at: null as string | null, returned: false,
      final_subtotal: null as number | null, manual_subtotal: null as number | null,
      daily_rate: 100000, day_units: 1, night_units: 0, days: 1,
      subtotal: 100000, shift_type: 'day', rate_source: 'auto',
      selected_kit_items: ['Зарядка'], missing_kit_items: [] as string[],
      equipment: { name: 'CANON R6', day_rate: 100000, daily_rate: 100000, day_night: 'day' },
    }],
  }
}

test('normal active rental is not classified as forgotten', () => {
  const order = normalizeOrder(fixture(), 0, now)
  assert.equal(matchesQueue(order, 'missing'), false)
  assert.equal(order.effectiveTotal, 100000)
})

test('missing kit from a partial return remains visible on an active order', () => {
  const raw = fixture()
  raw.order_items.push({ ...raw.order_items[0], id: 'item-2' })
  Object.assign(raw.order_items[0], {
    returned: true, actual_end_at: now.toISOString(), final_subtotal: 80000,
    missing_kit_items: ['Зарядка'],
  })
  const order = normalizeOrder(raw, 0, now)
  assert.equal(matchesQueue(order, 'missing'), true)
  assert.deepEqual(order.missingKitItems, ['Зарядка'])
  assert.equal(order.missingKitDetails[0].order_item_id, 'item-1')
  assert.equal(order.closeItems.length, 1)
  assert.equal(order.effectiveTotal, 180000)
})

test('completed order with missing kit leaves the queue when the kit is returned', () => {
  const raw = fixture()
  raw.status = 'returned'
  raw.order_items[0].returned = true
  raw.order_items[0].missing_kit_items = ['Зарядка']
  assert.equal(matchesQueue(normalizeOrder(raw, 0, now), 'missing'), true)
  raw.order_items[0].missing_kit_items = []
  assert.equal(matchesQueue(normalizeOrder(raw, 0, now), 'missing'), false)
})

test('cancelled and draft orders do not create missing-return obligations', () => {
  for (const status of ['cancelled', 'draft']) {
    const raw = fixture()
    raw.status = status
    raw.order_items[0].missing_kit_items = ['Зарядка']
    assert.equal(matchesQueue(normalizeOrder(raw, 0, now), 'missing'), false)
  }
})

test('overdue equipment is shown, while already returned equipment is excluded', () => {
  const raw = fixture()
  raw.order_items.push({ ...raw.order_items[0], id: 'item-2', returned: true })
  const later = buildTashkentDate('2026-09-07', '12:00')
  const order = normalizeOrder(raw, 0, later)
  assert.equal(matchesQueue(order, 'missing'), true)
  assert.deepEqual(order.overdueEquipmentNames, ['CANON R6'])
})

test('manual fixed price is respected by list total, debt and close preview', () => {
  for (const price of [0, 70000]) {
    const raw = fixture()
    raw.order_items[0].manual_subtotal = price
    const order = normalizeOrder(raw, 0, buildTashkentDate('2026-09-09', '12:00'))
    assert.equal(order.effectiveTotal, price)
    assert.equal(order.debt, price)
    assert.equal(order.closeItems[0].current_subtotal, price)
  }
})

test('additional equipment bills from its own issue time, not the order start', () => {
  const raw = fixture()
  const later = buildTashkentDate('2026-09-07', '14:00')
  const originalOnly = normalizeOrder(raw, 0, later)
  raw.order_items.push({ ...raw.order_items[0], id: 'item-2', actual_start_at: later.toISOString() })
  const withAddition = normalizeOrder(raw, 0, later)
  assert.equal(withAddition.effectiveTotal - originalOnly.effectiveTotal, 100000)
  assert.equal(withAddition.closeItems[1].current_subtotal, 100000)
})

test('list search supports Cyrillic/Latin names, phone masks and missing kit', () => {
  const raw = fixture()
  raw.order_items[0].missing_kit_items = ['Зарядка']
  const order = normalizeOrder(raw, 0, now)
  for (const query of ['Begzod', 'Бегзод', '507180400', '50 7180400', '+998507180400', 'Зарядка', '0321']) {
    assert.equal(matchesOrderSearch(order, query), true, query)
  }
  assert.equal(matchesOrderSearch(order, 'Совсем другой клиент'), false)
})
