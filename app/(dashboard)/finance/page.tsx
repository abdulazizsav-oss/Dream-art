import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { PaymentForm } from '@/components/finance/PaymentForm'
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS } from '@/lib/utils'
import { isSuperAdmin } from '@/lib/supabase/getRole'
import Link from 'next/link'

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order: orderId } = await searchParams
  const supabase = await createClient()
  const superAdmin = await isSuperAdmin()

  const today = new Date().toISOString().split('T')[0]

  const [{ data: payments }, { data: orders }] = await Promise.all([
    supabase
      .from('payments')
      .select('*, orders(order_number, clients(full_name))')
      .order('paid_at', { ascending: false })
      .limit(superAdmin ? 200 : 50),
    supabase
      .from('orders')
      .select('id, order_number, clients(full_name)')
      .in('status', ['active', 'overdue'])
      .order('order_number'),
  ])

  const now = new Date()

  // Super admin: full period stats
  const totalAllTime = superAdmin
    ? payments?.filter(p => !['deposit', 'deposit_return'].includes(p.payment_type))
        .reduce((s, p) => s + p.amount, 0) ?? 0
    : 0

  const totalThisMonth = payments
    ?.filter(p => {
      const d = new Date(p.paid_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        && !['deposit', 'deposit_return'].includes(p.payment_type)
    })
    .reduce((s, p) => s + p.amount, 0) ?? 0

  const totalToday = payments
    ?.filter(p => {
      const d = p.paid_at?.split('T')[0]
      return d === today && !['deposit', 'deposit_return'].includes(p.payment_type)
    })
    .reduce((s, p) => s + p.amount, 0) ?? 0

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Финансы" />

      {/* KPI cards — role-gated */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4">
          <p className="text-xs text-gray-500">Доход сегодня</p>
          <p className="text-2xl font-semibold mt-1 text-green-700">{formatCurrency(totalToday)}</p>
        </div>
        {superAdmin && (
          <>
            <div className="bg-white rounded-2xl border p-4">
              <p className="text-xs text-gray-500">Доход за месяц</p>
              <p className="text-2xl font-semibold mt-1 text-green-700">{formatCurrency(totalThisMonth)}</p>
            </div>
            <div className="bg-white rounded-2xl border p-4">
              <p className="text-xs text-gray-500">Доход за всё время</p>
              <p className="text-2xl font-semibold mt-1 text-green-700">{formatCurrency(totalAllTime)}</p>
            </div>
          </>
        )}
      </div>

      {/* Add payment form */}
      <div className="bg-white rounded-2xl border p-6">
        <h2 className="font-semibold mb-4">Добавить платёж</h2>
        <PaymentForm
          orders={(orders ?? []) as { id: string; order_number: string; clients: { full_name: string } | null }[]}
          defaultOrderId={orderId}
        />
      </div>

      {/* Payment log */}
      <div className="bg-white rounded-2xl border p-6">
        <h2 className="font-semibold mb-4">
          {superAdmin ? 'Последние платежи' : 'Платежи за сегодня'}
        </h2>
        <div className="space-y-2">
          {payments
            ?.filter(p => superAdmin ? true : p.paid_at?.split('T')[0] === today)
            .map(p => {
              const order = p.orders as { order_number: string; clients: { full_name: string } | null } | null
              return (
                <div key={p.id} className="flex justify-between items-center text-sm border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium">
                      {PAYMENT_TYPE_LABELS[p.payment_type]} — {PAYMENT_METHOD_LABELS[p.payment_method]}
                    </p>
                    <p className="text-xs text-gray-400">
                      {order?.order_number} · {order?.clients?.full_name} · {formatDate(p.paid_at)}
                    </p>
                    {p.notes && <p className="text-xs text-gray-400">{p.notes}</p>}
                  </div>
                  <span className="font-semibold text-green-700">{formatCurrency(p.amount)}</span>
                </div>
              )
            })}
          {!payments?.filter(p => superAdmin ? true : p.paid_at?.split('T')[0] === today).length && (
            <p className="text-gray-400 text-sm">Платежей нет</p>
          )}
        </div>
      </div>
    </div>
  )
}
