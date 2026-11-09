import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readOrderFilters } from './filters'

test('a copied URL restores the selected queue, search, delivery, sort and page', () => {
  assert.deepEqual(readOrderFilters(new URLSearchParams('queue=returned&q=SONY+А7&delivery=with&sort=debt&page=3')), {
    queue: 'returned', q: 'SONY А7', delivery: 'with', sort: 'debt', page: 3,
  })
})

test('invalid parameters fall back to working defaults', () => {
  assert.deepEqual(readOrderFilters(new URLSearchParams('queue=bad&delivery=bad&sort=bad&page=Infinity')), {
    queue: 'active', q: '', delivery: 'all', sort: 'newest', page: 1,
  })
  assert.equal(readOrderFilters(new URLSearchParams('page=-1')).page, 1)
})
