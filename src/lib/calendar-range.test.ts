import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCalendarWindow,
  calendarRangeDays,
  chooseNearestCalendarAnchor,
  findCalendarConflicts,
} from './calendar-range'

test('chooseNearestCalendarAnchor picks nearest active order', () => {
  const anchor = chooseNearestCalendarAnchor([
    { status: 'returned', start_date: '2026-05-09', end_date: '2026-05-09' },
    { status: 'active', start_date: '2026-04-23', end_date: '2026-04-23' },
    { status: 'active', start_date: '2026-06-01', end_date: '2026-06-02' },
  ], '2026-05-09')

  assert.equal(anchor?.start_date, '2026-04-23')
})

test('calendarRangeDays includes both boundaries', () => {
  assert.equal(calendarRangeDays('2026-06-01', '2026-06-01'), 1)
  assert.equal(calendarRangeDays('2026-06-01', '2026-06-14'), 14)
})

test('findCalendarConflicts detects overlapping orders for the same equipment', () => {
  const conflicts = findCalendarConflicts([
    { key: 'a:item', orderId: 'a', equipmentId: 'camera', from: '2026-06-10', to: '2026-06-12' },
    { key: 'b:item', orderId: 'b', equipmentId: 'camera', from: '2026-06-12', to: '2026-06-14' },
    { key: 'c:item', orderId: 'c', equipmentId: 'light', from: '2026-06-11', to: '2026-06-13' },
  ])

  assert.deepEqual(conflicts, {
    'a:item': ['b'],
    'b:item': ['a'],
  })
})

test('findCalendarConflicts ignores duplicate units inside one order', () => {
  const conflicts = findCalendarConflicts([
    { key: 'a:one', orderId: 'a', equipmentId: 'camera', from: '2026-06-10', to: '2026-06-12' },
    { key: 'a:two', orderId: 'a', equipmentId: 'camera', from: '2026-06-10', to: '2026-06-12' },
  ])

  assert.deepEqual(conflicts, {})
})

test('chooseNearestCalendarAnchor falls back to latest order when none are active', () => {
  const anchor = chooseNearestCalendarAnchor([
    { status: 'returned', start_date: '2026-04-23', end_date: '2026-04-23' },
    { status: 'cancelled', start_date: '2026-05-01', end_date: '2026-05-01' },
    { status: 'returned', start_date: '2026-04-22', end_date: '2026-04-23' },
  ], '2026-05-09')

  assert.equal(anchor?.start_date, '2026-05-01')
})

test('buildCalendarWindow centers the anchor with two days before it', () => {
  assert.deepEqual(buildCalendarWindow('2026-04-23', 14), {
    from: '2026-04-21',
    to: '2026-05-04',
  })
})
