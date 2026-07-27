import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTashkentDate } from './billing'
import {
  applicableRentalEndDate,
  isRentalOverdue,
  resolveRentalEndDate,
} from './order-overdue'

test('one planned daytime shift becomes overdue only when billing opens the next shift', () => {
  const input = {
    status: 'active',
    endDate: '2026-07-20',
    actualStartAt: '2026-07-20T04:30:00.000Z',
    returned: false,
    dayUnits: 1,
  }

  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-21', '10:00'),
  }), false)
  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-21', '10:01'),
  }), true)
})

test('return fact suppresses overdue regardless of debt or a stale open status', () => {
  const common = {
    status: 'active',
    endDate: '2026-07-20',
    now: buildTashkentDate('2026-07-21', '12:00'),
  }

  assert.equal(isRentalOverdue({ ...common, returned: true }), false)
  assert.equal(isRentalOverdue({
    ...common,
    actualEndAt: '2026-07-20T18:00:00+05:00',
  }), false)
})

test('missing end date reuses the daytime shift boundary from billing', () => {
  const input = {
    status: 'active',
    endDate: null,
    actualStartAt: buildTashkentDate('2026-07-20', '09:30').toISOString(),
    returned: false,
    dayUnits: 1,
    nightUnits: 0,
  }

  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-21', '10:00'),
  }), false)
  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-21', '10:01'),
  }), true)
})

test('missing end date reuses the evening 20:00 boundary from billing', () => {
  const input = {
    status: 'overdue',
    endDate: null,
    actualStartAt: buildTashkentDate('2026-07-20', '20:30').toISOString(),
    returned: false,
    dayUnits: 0,
    nightUnits: 1,
  }

  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-21', '19:59'),
  }), false)
  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-21', '20:00'),
  }), true)
})

test('multiple planned shifts are not overdue until billing opens another shift', () => {
  const input = {
    status: 'active',
    endDate: null,
    actualStartAt: buildTashkentDate('2026-07-20', '09:30').toISOString(),
    returned: false,
    dayUnits: 1,
    nightUnits: 1,
  }

  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-21', '23:00'),
  }), false)
  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-22', '00:01'),
  }), true)
})

test('planned dates derive assigned shifts when legacy rows have no saved unit counts', () => {
  const input = {
    status: 'active',
    startDate: '2026-07-20',
    endDate: '2026-07-21',
    actualStartAt: buildTashkentDate('2026-07-20', '09:30').toISOString(),
    returned: false,
  }

  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-21', '23:00'),
  }), false)
  assert.equal(isRentalOverdue({
    ...input,
    now: buildTashkentDate('2026-07-22', '00:01'),
  }), true)
})

test('calendar fallback derives a one-shift end date without adding fixed 24 hours', () => {
  assert.equal(resolveRentalEndDate({
    endDate: null,
    actualStartAt: buildTashkentDate('2026-07-20', '20:30').toISOString(),
    nightUnits: 1,
  }), '2026-07-20')
})

test('a later-added item does not inherit the original order end date', () => {
  assert.equal(applicableRentalEndDate({
    orderEndDate: '2026-07-20',
    orderActualStartAt: '2026-07-20T04:30:00.000Z',
    itemActualStartAt: '2026-07-22T15:30:00.000Z',
  }), null)

  assert.equal(applicableRentalEndDate({
    orderEndDate: '2026-07-20',
    orderActualStartAt: '2026-07-20T04:30:00.000Z',
    itemActualStartAt: '2026-07-20T04:30:00.000Z',
  }), '2026-07-20')
})
