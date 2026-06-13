import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeTelegramHtml } from './notifications'

test('Telegram HTML escaping protects user-controlled values', () => {
  assert.equal(
    escapeTelegramHtml(`Dream & <Art> "client's"`),
    'Dream &amp; &lt;Art&gt; &quot;client&#39;s&quot;',
  )
})
