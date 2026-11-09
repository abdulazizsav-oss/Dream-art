import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSearchText } from './search'

test('catalogue search tolerates extra spaces, non-breaking spaces and case', () => {
  assert.ok(normalizeSearchText('SONY  A7\u00a0S3').includes(normalizeSearchText(' sony A7 S3 ')))
  assert.equal(normalizeSearchText('  Штатив\n Manfrotto '), 'штатив manfrotto')
  assert.equal(normalizeSearchText(' \t '), '')
})
