import { test } from 'node:test'
import assert from 'node:assert/strict'
import { postOperation } from './operation-request'

test('payment confirmed only when the server confirms success', async () => {
  let calls = 0
  const request: typeof fetch = async (_url, init) => {
    calls++
    assert.equal(init?.method, 'POST')
    assert.equal(init?.body, JSON.stringify({ amount: 100 }))
    return new Response('{}', { status: 201 })
  }
  assert.equal((await postOperation('/payments', { amount: 100 }, request)).status, 'confirmed')
  assert.equal(calls, 1)
})

test('validation rejection gives the actionable server message', async () => {
  const request: typeof fetch = async () => new Response(JSON.stringify({ error: 'Сумма больше остатка' }), { status: 400 })
  assert.deepEqual(await postOperation('/payments', {}, request), { status: 'rejected', message: 'Сумма больше остатка' })
})

test('lost responses and server errors are uncertain and are never retried', async () => {
  for (const mode of ['network', 'server', 'timeout']) {
    let calls = 0
    const request: typeof fetch = async () => {
      calls++
      if (mode === 'network') throw new TypeError('Network unavailable')
      return new Response('', { status: mode === 'server' ? 500 : 408 })
    }
    assert.equal((await postOperation('/return', {}, request)).status, 'uncertain')
    assert.equal(calls, 1)
  }
})
