import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTashkentDate,
  computeActiveOrderTotal,
  computeOrderBilling,
  computeShifts,
} from './billing'

test('evening pickup stays one night through the following afternoon', () => {
  const start = buildTashkentDate('2026-04-24', '20:46')
  const end = buildTashkentDate('2026-04-25', '18:26')

  assert.deepEqual(computeShifts(start, end), {
    day_units: 0,
    night_units: 1,
    total_units: 1,
  })

  const billing = computeOrderBilling({
    start,
    end,
    items: [{
      equipment_id: 'canon-r5',
      day_rate: 50_000,
      night_rate: 150_000,
      day_night: 'both',
    }],
  })

  assert.equal(billing.total_amount, 150_000)
  assert.equal(billing.items[0]?.subtotal, 150_000)
})

test('same-day pickup after 20:00 is automatically a night shift', () => {
  const start = buildTashkentDate('2026-06-13', '20:30')
  const end = buildTashkentDate('2026-06-13', '23:15')

  assert.deepEqual(computeShifts(start, end), {
    day_units: 0,
    night_units: 1,
    total_units: 1,
  })
})

test('a second night starts at the next 20:00 boundary', () => {
  const start = buildTashkentDate('2026-06-13', '20:30')
  const end = buildTashkentDate('2026-06-14', '20:00')

  assert.deepEqual(computeShifts(start, end), {
    day_units: 0,
    night_units: 2,
    total_units: 2,
  })
})

test('active order opened at 21:20 totals one night before the next 20:00', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-06-14', '15:20'),
    items: [
      {
        id: 'sony',
        equipment_id: 'sony',
        rate_source: 'auto',
        actual_start_at: buildTashkentDate('2026-06-13', '21:20').toISOString(),
        actual_end_at: null,
        final_subtotal: null,
        final_day_units: null,
        final_night_units: null,
        day_rate: 100_000,
        night_rate: 100_000,
        day_night: 'both',
        subtotal: 100_000,
        day_units: 1,
        night_units: 0,
        shift_type: 'day',
      },
      {
        id: 'nd-77',
        equipment_id: 'nd-77',
        rate_source: 'auto',
        actual_start_at: buildTashkentDate('2026-06-13', '21:20').toISOString(),
        actual_end_at: null,
        final_subtotal: null,
        final_day_units: null,
        final_night_units: null,
        day_rate: 50_000,
        night_rate: 50_000,
        day_night: 'both',
        subtotal: 0,
        day_units: 1,
        night_units: 0,
        shift_type: 'day',
      },
    ],
  })

  assert.equal(result.total_amount, 150_000)
  assert.deepEqual(result.perItem.get('sony'), {
    id: 'sony',
    subtotal: 100_000,
    day_units: 0,
    night_units: 1,
    shift_type: 'night',
    frozen: false,
  })
  assert.equal(result.perItem.get('nd-77')?.subtotal, 50_000)
  assert.equal(result.perItem.get('nd-77')?.shift_type, 'night')
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

test('day-only equipment converts night units into day units', () => {
  const billing = computeOrderBilling({
    start: buildTashkentDate('2026-04-25', '09:30'),
    end: buildTashkentDate('2026-04-26', '23:00'),
    items: [
      { equipment_id: 'tripod', day_rate: 100_000, night_rate: 80_000, day_night: 'day' },
    ],
  })

  assert.equal(billing.items[0]?.day_units, 2)
  assert.equal(billing.items[0]?.night_units, 0)
  assert.equal(billing.items[0]?.subtotal, 200_000)
})

test('manual active items keep growing by elapsed units instead of freezing subtotal', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-04-25', '20:00'),
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

test('manual_subtotal freezes the item total regardless of elapsed time', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-04-28', '20:00'), // несколько суток спустя
    items: [{
      id: 'item-manual',
      equipment_id: 'canon-r5',
      rate_source: 'manual',
      actual_start_at: buildTashkentDate('2026-04-24', '20:46').toISOString(),
      actual_end_at: null,
      final_subtotal: null,
      final_day_units: null,
      final_night_units: null,
      day_rate: 150_000,
      night_rate: 150_000,
      subtotal: 999_999, // не должно использоваться
      day_units: 1,
      night_units: 0,
      shift_type: 'night',
      manual_subtotal: 500_000,
    }],
  })

  // Несмотря на 4 прошедшие ночи — итог зафиксирован на ручной сумме.
  assert.equal(result.total_amount, 500_000)
  assert.equal(result.perItem.get('item-manual')?.subtotal, 500_000)
  assert.equal(result.perItem.get('item-manual')?.frozen, true)
})

test('kit_per_shift adds to the per-shift subtotal (preview)', () => {
  // Вечерний старт → 1 ночная смена. База 150 000 + доп. комплект 30 000/смена = 180 000.
  const billing = computeOrderBilling({
    start: buildTashkentDate('2026-04-24', '20:46'),
    end: buildTashkentDate('2026-04-25', '18:26'),
    items: [{
      equipment_id: 'cam',
      day_rate: 50_000,
      night_rate: 150_000,
      day_night: 'both',
      kit_per_shift: 30_000,
    }],
  })
  assert.equal(billing.items[0]?.subtotal, 180_000)
  assert.equal(billing.total_amount, 180_000)
})

test('computeActiveOrderTotal includes kit_per_shift in live recompute', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-04-25', '18:26'),
    items: [{
      id: 'i1',
      equipment_id: 'cam',
      rate_source: 'auto',
      actual_start_at: buildTashkentDate('2026-04-24', '20:46').toISOString(),
      actual_end_at: null,
      final_subtotal: null,
      final_day_units: null,
      final_night_units: null,
      day_rate: 150_000,
      night_rate: 150_000,
      subtotal: 0,
      day_units: 0,
      night_units: 0,
      shift_type: 'night',
      kit_per_shift: 30_000,
    }],
  })
  // 1 ночь: база 150 000 + доп. 30 000 = 180 000
  assert.equal(result.total_amount, 180_000)
})

test('a returned manual item still uses final_subtotal, not manual_subtotal', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-04-25', '18:00'),
    items: [{
      id: 'item-closed',
      equipment_id: 'canon-r5',
      rate_source: 'manual',
      actual_start_at: buildTashkentDate('2026-04-24', '20:46').toISOString(),
      actual_end_at: buildTashkentDate('2026-04-25', '12:00').toISOString(),
      final_subtotal: 480_000,
      final_day_units: 0,
      final_night_units: 1,
      day_rate: 150_000,
      night_rate: 150_000,
      subtotal: 500_000,
      day_units: 1,
      night_units: 0,
      shift_type: 'night',
      manual_subtotal: 500_000,
    }],
  })

  assert.equal(result.total_amount, 480_000)
  assert.equal(result.perItem.get('item-closed')?.frozen, true)
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

  assert.equal(result.total_amount, 200_000)
  assert.equal(result.perItem.get('returned-item')?.frozen, true)
  assert.equal(result.perItem.get('open-item')?.subtotal, 150_000)
})

test('an item added later is billed only from its own actual_start_at', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-08-09', '21:00'),
    items: [
      {
        id: 'original-item',
        equipment_id: 'camera',
        rate_source: 'auto',
        actual_start_at: buildTashkentDate('2026-08-08', '10:00').toISOString(),
        actual_end_at: null,
        final_subtotal: null,
        final_day_units: null,
        final_night_units: null,
        day_rate: 100_000,
        night_rate: 100_000,
        day_night: 'both',
        subtotal: 100_000,
        day_units: 1,
        night_units: 0,
        shift_type: 'day',
      },
      {
        id: 'added-item',
        equipment_id: 'light',
        rate_source: 'auto',
        actual_start_at: buildTashkentDate('2026-08-09', '20:15').toISOString(),
        actual_end_at: null,
        final_subtotal: null,
        final_day_units: null,
        final_night_units: null,
        day_rate: 50_000,
        night_rate: 80_000,
        day_night: 'both',
        subtotal: 50_000,
        day_units: 1,
        night_units: 0,
        shift_type: 'day',
      },
    ],
  })

  assert.equal(result.perItem.get('original-item')?.subtotal, 200_000)
  assert.equal(result.perItem.get('added-item')?.subtotal, 80_000)
  assert.equal(result.total_amount, 280_000)
})

test('computeActiveOrderTotal adds delivery once and keeps rental breakdown separate', () => {
  const result = computeActiveOrderTotal({
    now: buildTashkentDate('2026-04-25', '18:26'),
    delivery_fee: 35_000,
    items: [{
      id: 'delivery-order-item',
      equipment_id: 'canon-r5',
      rate_source: 'auto',
      actual_start_at: null,
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
    }],
  })

  assert.equal(result.rental_amount, 150_000)
  assert.equal(result.delivery_fee, 35_000)
  assert.equal(result.total_amount, 185_000)
})
