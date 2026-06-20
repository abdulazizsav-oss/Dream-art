import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegacyMissingKitEvents,
  buildMissingKitByClient,
  calendarDaysSince,
  formatMissingKitAge,
  formatMissingSinceDateTime,
  mergeMissingKitEvents,
  type LegacyMissingKitOrderRow,
  type MissingKitEventRow,
} from './missing-kit'

test('calendarDaysSince counts Tashkent calendar days', () => {
  const missingSince = '2026-05-09T20:00:00+05:00'
  const now = new Date('2026-05-11T09:00:00+05:00')

  assert.equal(calendarDaysSince(missingSince, now), 2)
  assert.equal(formatMissingKitAge(missingSince, now), '2 дня')
  assert.equal(formatMissingSinceDateTime(missingSince), '09.05.2026, 20:00')
})

test('calendarDaysSince formats same-day missing kit as today', () => {
  const missingSince = '2026-05-11T01:00:00+05:00'
  const now = new Date('2026-05-11T23:00:00+05:00')

  assert.equal(calendarDaysSince(missingSince, now), 0)
  assert.equal(formatMissingKitAge(missingSince, now), 'сегодня')
})

test('buildMissingKitByClient groups active events by client, order and item', () => {
  const events: MissingKitEventRow[] = [
    {
      id: 'event-1',
      order_id: 'order-1',
      order_item_id: 'item-1',
      kit_name: 'Battery',
      missing_since: '2026-05-09T10:00:00+05:00',
      returned_at: null,
      orders: {
        id: 'order-1',
        order_number: 'DA-2026-0001',
        client_id: 'client-1',
        status: 'returned',
        created_at: '2026-05-08T10:00:00+05:00',
      },
      order_items: {
        id: 'item-1',
        equipment: { name: 'Canon R5' },
      },
    },
    {
      id: 'event-2',
      order_id: 'order-1',
      order_item_id: 'item-1',
      kit_name: 'Charger',
      missing_since: '2026-05-10T10:00:00+05:00',
      returned_at: null,
      orders: {
        id: 'order-1',
        order_number: 'DA-2026-0001',
        client_id: 'client-1',
        status: 'returned',
        created_at: '2026-05-08T10:00:00+05:00',
      },
      order_items: {
        id: 'item-1',
        equipment: { name: 'Canon R5' },
      },
    },
    {
      id: 'event-3',
      order_id: 'order-2',
      order_item_id: 'item-2',
      kit_name: 'Cable',
      missing_since: '2026-05-10T10:00:00+05:00',
      returned_at: '2026-05-11T10:00:00+05:00',
      orders: {
        id: 'order-2',
        order_number: 'DA-2026-0002',
        client_id: 'client-1',
        status: 'returned',
        created_at: '2026-05-08T10:00:00+05:00',
      },
      order_items: {
        id: 'item-2',
        equipment: { name: 'Sony A7' },
      },
    },
  ]

  const grouped = buildMissingKitByClient(events, new Date('2026-05-11T10:00:00+05:00'))
  const client = grouped.get('client-1')

  assert.equal(client?.total, 2)
  assert.deepEqual(client?.names, ['Battery', 'Charger'])
  assert.equal(client?.orders[0]?.items[0]?.equipment_name, 'Canon R5')
  assert.deepEqual(client?.orders[0]?.items[0]?.missing_kit_items, ['Battery', 'Charger'])
  assert.deepEqual(client?.orders[0]?.items[0]?.missing.map(item => item.age_days), [2, 1])
})

test('buildLegacyMissingKitEvents keeps missing date and time from actual return timestamp', () => {
  const orders: LegacyMissingKitOrderRow[] = [
    {
      id: 'order-1',
      order_number: 'DA-2026-0009',
      client_id: 'client-1',
      status: 'returned',
      created_at: '2026-05-08T05:00:00.000Z',
      updated_at: '2026-05-09T09:30:00.000Z',
      actual_end_at: '2026-05-09T15:00:00.000Z',
      actual_return_date: '2026-05-09',
      order_items: [
        {
          id: 'item-1',
          actual_end_at: '2026-05-09T16:20:00.000Z',
          missing_kit_items: ['SD 160'],
          equipment: { name: 'SONY FX3' },
        },
      ],
    },
  ]

  const events = buildLegacyMissingKitEvents(orders)

  assert.equal(events.length, 1)
  assert.equal(events[0]?.missing_since, '2026-05-09T16:20:00.000Z')
  assert.equal(formatMissingSinceDateTime(events[0]!.missing_since), '09.05.2026, 21:20')

  const grouped = buildMissingKitByClient(events, new Date('2026-05-11T09:00:00+05:00'))
  const item = grouped.get('client-1')?.orders[0]?.items[0]

  assert.equal(item?.equipment_name, 'SONY FX3')
  assert.equal(item?.missing[0]?.kit_name, 'SD 160')
  assert.equal(item?.missing[0]?.age_days, 2)
})

test('mergeMissingKitEvents prefers history rows over legacy fallback duplicates', () => {
  const history: MissingKitEventRow[] = [
    {
      id: 'event-1',
      order_id: 'order-1',
      order_item_id: 'item-1',
      kit_name: 'SD 160',
      missing_since: '2026-05-09T18:00:00.000Z',
      returned_at: null,
      orders: {
        id: 'order-1',
        order_number: 'DA-2026-0009',
        client_id: 'client-1',
      },
    },
  ]
  const fallback: MissingKitEventRow[] = [
    {
      ...history[0]!,
      id: 'legacy:item-1:SD 160',
      missing_since: '2026-05-09T16:20:00.000Z',
    },
  ]

  const merged = mergeMissingKitEvents(history, fallback)

  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.id, 'event-1')
  assert.equal(merged[0]?.missing_since, '2026-05-09T18:00:00.000Z')
})
