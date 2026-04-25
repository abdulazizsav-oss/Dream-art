import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTashkentDate,
  computeActiveOrderTotal,
  computeOrderBilling,
  computeShifts,
} from './billing'

test('evening pickup held after next morning bills as night plus day', () => {
  const start = buildTashkentDate('2026-04-24', '20:46')
  const end = buildTashkentDate('2026-04-25', '18:26')

  assert.deepEqual(computeShifts(start, end), {
    day_units: 1,
    night_units: 1,
    total_units: 2,
  })

  const billing = computeOrderBilling({
    start,
    end,
    items: [{ equipment_id: 'canon-r5', day_rate: 150_000, night_rate: 150_000 }],
  })

  assert.equal(billing.total_amount, 300_000)
  assert.equal(billing.items[0]?.subtotal, 300_000)
})

test('new order preview scenario totals 800000 UZS', () => {
  const billing = computeOrderBilling({
    start: buildTashkentDate('2026-04-25', '09:30'),
    end: buildTashkentDate('2026-04-26', '23:00'),
    items: [
      { equipment_id: 'canon-r5', day_rate: 150_000, night_rate: 150_000 },
      { equipment_id: 'canon-m4', day_rate: 50_000, night_rate: 50_000 },
      { equipment_id: 'canon-r5c', day_rate: 200_000, night_rate: 200_000 },
    ],
  })

  assert.equal(billing.day_units, 1)
  assert.equal(billing.night_units, 1)
  assert.equal(billing.total_amount, 800_000)
})

test('manual active items keep growing by elapsed units instead of freezing subtotal', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-04-25', '18:26'),
    items: [{
      id: 'item-1',
      equipment_id: 'canon-r5',
      rate_source: 'manual',
      actual_start_at: buildTashkentDate('2026-04-24', '20:46').toISOString(),
      actual_end_at: null,
      final_subtotal: null,
      final_day_units: null,
      final_night_units: null,
      day_rate: 150_000,
      night_rate: 150_000,
      subtotal: 150_000,
      day_units: 1,
      night_units: 0,
      shift_type: 'night',
    }],
  })

  assert.equal(result.total_amount, 300_000)
  assert.deepEqual(result.perItem.get('item-1'), {
    id: 'item-1',
    subtotal: 300_000,
    day_units: 0,
    night_units: 2,
    shift_type: 'night',
    frozen: false,
  })
})

test('ongoing second night is billed immediately after midnight', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-04-26', '00:11'),
    items: [{
      id: 'da-2026-0004',
      equipment_id: 'canon-r5c',
      rate_source: 'auto',
      actual_start_at: buildTashkentDate('2026-04-24', '15:09').toISOString(),
      actual_end_at: null,
      final_subtotal: null,
      final_day_units: null,
      final_night_units: null,
      day_rate: 200_000,
      night_rate: 200_000,
      subtotal: 400_000,
      day_units: 1,
      night_units: 1,
      shift_type: 'day',
    }],
  })

  assert.equal(result.total_amount, 600_000)
  assert.deepEqual(result.perItem.get('da-2026-0004'), {
    id: 'da-2026-0004',
    subtotal: 600_000,
    day_units: 1,
    night_units: 2,
    shift_type: 'night',
    frozen: false,
  })
})

test('partial return freezes returned items while open items keep billing live', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-04-25', '18:26'),
    items: [
      {
        id: 'returned-item',
        equipment_id: 'canon-m4',
        rate_source: 'auto',
        actual_start_at: buildTashkentDate('2026-04-24', '09:30').toISOString(),
        actual_end_at: buildTashkentDate('2026-04-24', '18:00').toISOString(),
        final_subtotal: 50_000,
        final_day_units: 1,
        final_night_units: 0,
        day_rate: 50_000,
        night_rate: 50_000,
        subtotal: 50_000,
        day_units: 1,
        night_units: 0,
        shift_type: 'day',
      },
      {
        id: 'open-item',
        equipment_id: 'canon-r5',
        rate_source: 'auto',
        actual_start_at: buildTashkentDate('2026-04-24', '20:46').toISOString(),
        actual_end_at: null,
        final_subtotal: null,
        final_day_units: null,
        final_night_units: null,
        day_rate: 150_000,
        night_rate: 150_000,
        subtotal: 150_000,
        day_units: 1,
        night_units: 0,
        shift_type: 'day',
      },
    ],
  })

  assert.equal(result.total_amount, 350_000)
  assert.equal(result.perItem.get('returned-item')?.frozen, true)
  assert.equal(result.perItem.get('open-item')?.subtotal, 300_000)
})
