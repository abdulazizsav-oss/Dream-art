import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  beginClientPhoneInput,
  clientMatchesSearch,
  findPotentialClientDuplicates,
  finishClientPhoneInput,
  formatClientPhoneInput,
  normalizeClientName,
  normalizeClientPhone,
} from './client-duplicates'

const clients = [
  { id: '1', full_name: 'Каримов Жасур Бахромович', phone: '+998 90 123-45-67' },
  { id: '2', full_name: 'Каримова Малика', phone: '+998 91 000-00-00' },
  { id: '3', full_name: 'Бегзод', phone: '+998 90 309-77-79', telegram_username: '@begzod_photo' },
  { id: '4', full_name: 'Алексей Смирнов', phone: '+7 999 123-45-67' },
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

test('normalizes +7, Russian trunk prefix and local number to one phone', () => {
  assert.equal(normalizeClientPhone('+7 999 123-45-67'), '9991234567')
  assert.equal(normalizeClientPhone('8 (999) 123-45-67'), '9991234567')
  assert.equal(normalizeClientPhone('9991234567'), '9991234567')

  const matches = findPotentialClientDuplicates(clients, {
    full_name: 'Другой клиент',
    phone: '8 999 123 45 67',
  })
  assert.deepEqual(matches.map(match => [match.id, match.reason]), [['4', 'exact_phone']])
})

test('formats Uzbek and Russian phones with a stable mask', () => {
  assert.equal(formatClientPhoneInput('901234567'), '+998 90 123-45-67')
  assert.equal(formatClientPhoneInput('507180400'), '+998 50 718-04-00')
  assert.equal(formatClientPhoneInput('50 7180400'), '+998 50 718-04-00')
  assert.equal(formatClientPhoneInput('998045442'), '+998 99 804-54-42')
  assert.equal(normalizeClientPhone('998045442'), '998045442')
  assert.equal(formatClientPhoneInput('+998 50 7180400'), '+998 50 718-04-00')
  assert.equal(formatClientPhoneInput('998901234567'), '+998 90 123-45-67')
  assert.equal(formatClientPhoneInput('+79991234567'), '+7 999 123-45-67')
  assert.equal(formatClientPhoneInput('89991234567'), '+7 999 123-45-67')
})

test('starts an empty phone with +998 and clears an unused prefix on blur', () => {
  assert.equal(beginClientPhoneInput(''), '+998')
  assert.equal(beginClientPhoneInput('50 7180400'), '+998 50 718-04-00')
  assert.equal(finishClientPhoneInput('+998'), '')
  assert.equal(finishClientPhoneInput('+998 50 7180400'), '+998 50 718-04-00')
})

test('warns about a matching or very similar full name, but not a surname alone', () => {
  assert.equal(normalizeClientName('Каримов  Жасур-Бахромович'), 'karimov jasur bahromovich')

  const similar = findPotentialClientDuplicates(clients, {
    full_name: 'Каримов Жасур Бахрамович',
  })
  assert.deepEqual(similar.map(match => [match.id, match.reason]), [['1', 'similar_name']])

  const surnameOnly = findPotentialClientDuplicates(clients, { full_name: 'Каримов' })
  assert.deepEqual(surnameOnly, [])
})

test('matches the same name across Cyrillic and Latin transliterations', () => {
  assert.equal(normalizeClientName('Бахром'), normalizeClientName('Baxrom'))
  assert.equal(normalizeClientName('Бахром'), normalizeClientName('Bakhrom'))

  const crossScript = findPotentialClientDuplicates(clients, {
    full_name: 'Karimov Jasur Baxromovich',
  })
  assert.deepEqual(crossScript.map(match => [match.id, match.reason]), [['1', 'exact_name']])

  const oneWordTypo = findPotentialClientDuplicates(clients, { full_name: 'Bekzod' })
  assert.deepEqual(oneWordTypo.map(match => [match.id, match.reason]), [['3', 'similar_name']])
})

test('client search understands scripts, phonetic typos, phone masks and telegram', () => {
  const begzod = clients[2]
  const jasur = clients[0]

  assert.equal(clientMatchesSearch(begzod, 'Begzod'), true)
  assert.equal(clientMatchesSearch(begzod, 'Бекзод'), true)
  assert.equal(clientMatchesSearch(jasur, 'Jasur Baxromovich'), true)
  assert.equal(clientMatchesSearch(begzod, '3097779'), true)
  assert.equal(clientMatchesSearch(begzod, '+998 90 309'), true)
  assert.equal(clientMatchesSearch(begzod, '@begzod_photo'), true)
  assert.equal(clientMatchesSearch(begzod, 'Малика'), false)
})

test('seven phone digits produce a partial-phone duplicate warning', () => {
  const matches = findPotentialClientDuplicates(clients, {
    full_name: 'Совсем другое имя',
    phone: '123-45-67',
  })

  assert.deepEqual(matches.map(match => [match.id, match.reason]).sort(), [
    ['1', 'similar_phone'],
    ['4', 'similar_phone'],
  ])
})
