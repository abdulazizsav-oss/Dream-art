import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTashkentDate } from '@/lib/billing'
import { isOrderItemAddedLater, resolveAddedItemBillingWindow } from './add-items'

test('added item preview starts now and keeps a future order end', () => {
  const window = resolveAddedItemBillingWindow({
    now: buildTashkentDate('2026-08-09', '13:52'),
    orderEndDate: '2026-08-10',
    orderEndTime: '18:30:00',
  })

  assert.deepEqual(window, {
    start_date: '2026-08-09',
    start_time: '13:52',
    end_date: '2026-08-10',
    end_time: '18:30',
  })
})

test('added item preview never creates a reversed same-day time range', () => {
  const window = resolveAddedItemBillingWindow({
    now: buildTashkentDate('2026-08-09', '21:15'),
    orderEndDate: '2026-08-09',
    orderEndTime: '18:00',
  })

  assert.deepEqual(window, {
    start_date: '2026-08-09',
    start_time: '21:15',
    end_date: '2026-08-09',
    end_time: '23:59',
  })
})

test('only an item with its own later start is marked as added later', () => {
  const orderStart = buildTashkentDate('2026-08-09', '10:00').toISOString()

  assert.equal(isOrderItemAddedLater({
    orderActualStartAt: orderStart,
    itemActualStartAt: orderStart,
  }), false)
  assert.equal(isOrderItemAddedLater({
    orderActualStartAt: orderStart,
    itemActualStartAt: buildTashkentDate('2026-08-09', '13:52').toISOString(),
  }), true)
  assert.equal(isOrderItemAddedLater({
    orderActualStartAt: orderStart,
    itemActualStartAt: null,
  }), false)
})
