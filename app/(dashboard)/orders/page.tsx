import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDateRange, formatDateTime, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, ClipboardList } from 'lucide-react'
import { CloseOrderButton } from '@/components/orders/CloseOrderButton'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('*, clients(full_name), created_by_profile:user_profiles!orders_created_by_profile_fk(full_name), payments(amount, payment_type)')
    .order('created_at', { ascending: false })
    .limit(100)

  const active = orders?.filter(o => ['active', 'overdue'].includes(o.status)) ?? []
  const past = orders?.filter(o => ['returned', 'cancelled', 'draft'].includes(o.status)) ?? []

  return (
    <div>
      <PageHeader
        title="Аренда"
        description={`${active.length} активных · ${orders?.length ?? 0} всего`}
        action={
          <Link href="/orders/new">
            <Button className="min-h-[48px] px-5 text-base"><Plus className="w-4 h-4 mr-2" />Новый заказ</Button>
          </Link>
        }
      />

      {active.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Активные</h2>
          <div className="bg-white rounded-xl border divide-y">
            {active.map(o => <OrderRow key={o.id} order={o} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">История</h2>
          <div className="bg-white rounded-xl border divide-y">
            {past.map(o => <OrderRow key={o.id} order={o} />)}
          </div>
        </div>
      )}

      {!orders?.length && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Заказов нет</p>
          <Link href="/orders/new" className="mt-3 inline-block">
            <Button size="sm">Создать первый заказ</Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function OrderRow({ order }: { order: { id: string; order_number: string; status: string; start_date: string; end_date: string; total_amount: number; created_at: string | null; clients: { full_name: string } | null; payments?: { amount: number; payment_type: string }[] | null } }) {
  const isActive = order.status === 'active' || order.status === 'overdue'
  const paidRental = (order.payments ?? []).filter(p => p.payment_type === 'rental').reduce((s, p) => s + p.amount, 0)
  const debt = Math.max(0, order.total_amount - paidRental)
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors min-h-[64px] gap-2">
      <Link href={`/orders/${order.id}`} className="flex-1 min-w-0">
        <p className="font-medium text-sm">{order.order_number}</p>
        <p className="text-xs text-gray-400 truncate">
          {order.clients?.full_name} · {formatDateRange(order.start_date, order.end_date)}
          {order.created_at ? ` · ${formatDateTime(order.created_at)}` : ''}
        </p>
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm text-gray-700 hidden sm:inline">{formatCurrency(order.total_amount)}</span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ORDER_STATUS_COLORS[order.status])}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
        {isActive && (
          <CloseOrderButton orderId={order.id} debt={debt} variant="outline" size="sm" className="text-xs" />
        )}
      </div>
    </div>
  )
}
