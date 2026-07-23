import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findPotentialClientDuplicates,
  normalizeClientName,
  normalizeClientPhone,
} from './client-duplicates'

const clients = [
  { id: '1', full_name: 'Каримов Жасур Бахромович', phone: '+998 90 123-45-67' },
  { id: '2', full_name: 'Каримова Малика', phone: '+998 91 000-00-00' },
]

test('normalizes Uzbek phone formatting before duplicate matching', () => {
  assert.equal(normalizeClientPhone('+998 90 123-45-67'), '901234567')
  assert.equal(normalizeClientPhone('90 123 45 67'), '901234567')

  const matches = findPotentialClientDuplicates(clients, {
    full_name: 'Другой клиент',
    phone: '90 123 45 67',
  })

  assert.deepEqual(matches.map(match => [match.id, match.reason]), [['1', 'exact_phone']])
})

test('warns about a matching or very similar full name, but not a surname alone', () => {
  assert.equal(normalizeClientName('Каримов  Жасур-Бахромович'), 'каримов жасур бахромович')

  const similar = findPotentialClientDuplicates(clients, {
    full_name: 'Каримов Жасур Бахрамович',
  })
  assert.deepEqual(similar.map(match => [match.id, match.reason]), [['1', 'similar_name']])

  const surnameOnly = findPotentialClientDuplicates(clients, { full_name: 'Каримов' })
  assert.deepEqual(surnameOnly, [])
})

