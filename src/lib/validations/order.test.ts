import assert from 'node:assert/strict'
import test from 'node:test'
import { orderSchema } from './order'

const validOrder = {
  client_id: '1c55ae4b-bdce-4bda-9189-bf67e1d7a769',
  start_date: '2026-06-13',
  end_date: '2026-06-14',
  deposit_amount: 0,
  items: [{
    equipment_id: '74234787-fb59-43b2-b7fb-1b50a2c9d86f',
    daily_rate: 100_000,
    days: 1,
    subtotal: 100_000,
  }],
}

test('order schema accepts a valid date range', () => {
  assert.equal(orderSchema.safeParse(validOrder).success, true)
})

test('order schema rejects an end date before the start date', () => {
  const result = orderSchema.safeParse({
    ...validOrder,
    end_date: '2026-06-12',
  })

  assert.equal(result.success, false)
  if (!result.success) {
    assert.equal(
      result.error.issues.some(issue =>
        issue.path.join('.') === 'end_date'
        && issue.message === 'Дата окончания не может быть раньше даты начала'
      ),
      true,
    )
  }
})

test('order schema rejects impossible calendar dates', () => {
  assert.equal(orderSchema.safeParse({
    ...validOrder,
    end_date: '2026-02-31',
  }).success, false)
})
