import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as utils from '../utils'
import * as rental from '../rental'
import * as orderList from '../orders/list'
import * as missingKit from '../missing-kit'

// Run the real page/component/handler with isolated auth and database adapters.
// These tests never connect to Supabase or change real users' roles.
const require = createRequire(import.meta.url)
function loadModule(path: string, mocks: Record<string, unknown>) {
  const source = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const exports: Record<string, any> = {}
  runInNewContext(output, {
    exports,
    require: (id: string) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
  })
  return exports
}

function database(data: Record<string, unknown>, queried: string[]) {
  return { from(table: string) {
    queried.push(table)
    const result = { data: data[table] ?? [], error: null }
    const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) }
    for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit', 'range']) query[method] = () => query
    query.single = async () => result
    return query
  } }
}

test('orders hide total debt by default but retain individual order debt and return actions', () => {
  const { OrdersExplorer } = loadModule('src/components/orders/OrdersExplorer.tsx', {
    'next/link': 'a',
    '@/components/ui/button': { Button: 'button' },
    '@/components/orders/CloseOrderButton': { CloseOrderButton: () => createElement('button', null, 'Закрыть заказ') },
    '@/components/orders/ReturnMissingKitButton': { ReturnMissingKitButton: () => null },
    '@/lib/utils': utils,
    '@/lib/orders/list': orderList,
  })
  const orders = [orderList.normalizeOrder({
    id: 'test-order', order_number: 'TEST-1', status: 'active', start_date: '2026-09-06',
    end_date: '2026-09-06', total_amount: 200000, clients: { full_name: 'Тест' }, order_items: [],
  }, 0, new Date('2026-09-06T08:00:00Z'))]
  const render = (showFinancialSummary?: boolean) => renderToStaticMarkup(createElement(OrdersExplorer, {
    orders, totalCount: 1, showFinancialSummary,
  }))
  for (const enabled of [undefined, false]) {
    const html = render(enabled)
    assert.doesNotMatch(html, /Общий долг/)
    assert.match(html, /Долг:/)
    assert.match(html, /Закрыть заказ/)
    assert.match(html, /xl:grid-cols-4/)
  }
  assert.match(render(true), /Общий долг/)
  assert.match(render(true), /xl:grid-cols-5/)
})

for (const superAdmin of [false, true]) {
  test(`client turnover is rendered only for super_admin (${superAdmin})`, async () => {
    const db = database({ clients: { id: 'test', full_name: 'Тест', deposit_held: 50000 } }, [])
    const { default: Page } = loadModule('app/(dashboard)/clients/[id]/page.tsx', {
      '@/lib/supabase/server': { createClient: async () => db },
      '@/lib/supabase/getRole': { isSuperAdmin: async () => superAdmin },
      'next/navigation': { notFound: () => { throw new Error('Not found') } },
      'next/link': 'a',
      '@/components/layout/PageHeader': { PageHeader: () => null },
      '@/components/clients/ClientForm': { ClientForm: () => null },
      '@/components/clients/ReliabilityRating': { ReliabilityRating: () => null },
      '@/components/orders/ReturnMissingKitButton': { ReturnMissingKitButton: () => null },
      '@/lib/utils': utils,
      '@/lib/missing-kit': missingKit,
    })
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: 'test' }) }))
    assert.equal(html.includes('Общий оборот'), superAdmin)
    assert.match(html, /Депозит/)
    assert.match(html, /Аренд всего/)
  })

  test(`equipment revenue is fetched and rendered only for super_admin (${superAdmin})`, async () => {
    const queried: string[] = []
    const db = database({
      equipment: { id: 'test', name: 'Штатив', daily_rate: 20000, currency: 'UZS', equipment_maintenance: [] },
      v_equipment_utilization: { total_revenue: 7730000, roi_percent: 120 },
    }, queried)
    const { default: Page } = loadModule('app/(dashboard)/equipment/[id]/page.tsx', {
      '@/lib/supabase/server': { createClient: async () => db },
      '@/lib/supabase/getRole': { isSuperAdmin: async () => superAdmin },
      'next/navigation': { notFound: () => { throw new Error('Not found') } },
      'next/link': 'a',
      '@/components/layout/PageHeader': { PageHeader: () => null },
      '@/components/equipment/EquipmentForm': { EquipmentForm: () => null },
      '@/lib/utils': utils,
      '@/lib/rental': rental,
    })
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: 'test' }) }))
    assert.equal(queried.includes('v_equipment_utilization'), superAdmin)
    assert.equal(html.includes('Заработано'), superAdmin)
    assert.equal(html.includes('ROI'), superAdmin)
    assert.match(html, /Ставки аренды/)
  })
}

for (const role of [null, 'admin', 'super_admin']) {
  test(`analytics API requires a verified super_admin profile (${role})`, async () => {
    const queried: string[] = []
    const { GET } = loadModule('app/api/analytics/route.ts', {
      '@/lib/supabase/getRole': { getMyProfile: async () => role ? { role } : null },
      '@/lib/supabase/server': { createClient: async () => database({}, queried) },
    })
    const response = await GET()
    assert.equal(response.status, role === 'super_admin' ? 200 : role ? 403 : 401)
    assert.equal(queried.length > 0, role === 'super_admin')
  })
}
