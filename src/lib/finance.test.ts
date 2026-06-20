import assert from 'node:assert/strict'
import test from 'node:test'
import { getFinancePeriod, percentageChange } from './finance'

test('finance periods use calendar boundaries', () => {
  assert.deepEqual(getFinancePeriod('today', '2026-06-13'), {
    from: '2026-06-13',
    to: '2026-06-13',
  })
  assert.deepEqual(getFinancePeriod('week', '2026-06-13'), {
    from: '2026-06-08',
    to: '2026-06-13',
  })
  assert.deepEqual(getFinancePeriod('month', '2026-06-13'), {
    from: '2026-06-01',
    to: '2026-06-13',
  })
  assert.deepEqual(getFinancePeriod('quarter', '2026-06-13'), {
    from: '2026-04-01',
    to: '2026-06-13',
  })
  assert.deepEqual(getFinancePeriod('year', '2026-06-13'), {
    from: '2026-01-01',
    to: '2026-06-13',
  })
})

test('percentage comparison handles empty previous periods', () => {
  assert.equal(percentageChange(0, 0), 0)
  assert.equal(percentageChange(100, 0), null)
  assert.equal(percentageChange(120, 100), 20)
  assert.equal(percentageChange(80, 100), -20)
})
