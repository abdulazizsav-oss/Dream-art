import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDateRange, formatDateTime, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, ClipboardList, AlertTriangle } from 'lucide-react'
import { CloseOrderButton } from '@/components/orders/CloseOrderButton'
import { computeActiveOrderTotal, type ActiveItemInput } from '@/lib/billing'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('*, clients(full_name), created_by_profile:user_profiles!orders_created_by_profile_fk(full_name), payments(amount, payment_type), order_items(id, equipment_id, rate_source, subtotal, daily_rate, day_rate_snapshot, night_rate_snapshot, selected_kit_items, missing_kit_items, equipment(name, day_rate, night_rate, daily_rate))')
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
            {active.map(o => <OrderRow key={o.id} order={o as any} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">История</h2>
          <div className="bg-white rounded-xl border divide-y">
            {past.map(o => <OrderRow key={o.id} order={o as any} />)}
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

function OrderRow({ order }: { order: {
  id: string; order_number: string; status: string; start_date: string; end_date: string;
  total_amount: number; created_at: string | null;
  actual_start_at?: string | null;
  clients: { full_name: string } | null;
  created_by_profile?: { full_name: string } | null;
  payments?: { amount: number; payment_type: string }[] | null;
  order_items?: {
    id: string; equipment_id: string;
    rate_source?: 'auto' | 'manual' | null;
    subtotal?: number | null;
    daily_rate?: number | null;
    day_rate_snapshot?: number | null;
    night_rate_snapshot?: number | null;
    selected_kit_items: string[] | null;
    missing_kit_items: string[] | null;
    equipment: { name: string; day_rate?: number | null; night_rate?: number | null; daily_rate?: number | null } | null;
  }[] | null;
} }) {
  const isActive = order.status === 'active' || order.status === 'overdue'
  const isClosed = order.status === 'returned'
  const paidRental = (order.payments ?? []).filter(p => p.payment_type === 'rental').reduce((s, p) => s + p.amount, 0)

  // ── Live-сумма для активных: от actual_start_at до now() через единую формулу ──
  let effectiveTotal = order.total_amount
  if (isActive && order.actual_start_at && (order.order_items?.length ?? 0) > 0) {
    const autos = (order.order_items ?? []).filter(it => it.rate_source !== 'manual')
    const manuals = (order.order_items ?? []).filter(it => it.rate_source === 'manual')
    const billingInputs: BillingItemInput[] = autos.map(it => {
      const eq = it.equipment
      const dayRate = eq?.day_rate ?? it.day_rate_snapshot ?? eq?.daily_rate ?? it.daily_rate ?? 0
      const nightRate = eq?.night_rate ?? it.night_rate_snapshot ?? dayRate
      return { equipment_id: it.equipment_id, day_rate: dayRate, night_rate: nightRate }
    })
    const live = billingInputs.length > 0
      ? computeOrderBilling({ start: new Date(order.actual_start_at), end: new Date(), items: billingInputs })
      : null
    const manualSum = manuals.reduce((s, it) => s + (it.subtotal ?? 0), 0)
    if (live) effectiveTotal = live.total_amount + manualSum
  }

  const debt = Math.max(0, effectiveTotal - paidRental)
  const createdBy = order.created_by_profile?.full_name

  // Prepare items for CloseOrderButton (with kit data)
  const closeItems = (order.order_items ?? []).map(it => ({
    id: it.id,
    name: it.equipment?.name ?? '—',
    selected_kit_items: it.selected_kit_items ?? [],
  }))

  // Check for missing kit items in closed orders
  const allMissing = isClosed
    ? (order.order_items ?? []).flatMap(it => (it.missing_kit_items ?? []))
    : []

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors min-h-[64px] gap-2">
      <Link href={`/orders/${order.id}`} className="flex-1 min-w-0">
        <p className="font-medium text-sm">{order.order_number}</p>
        <p className="text-xs text-gray-400 truncate">
          {order.clients?.full_name} · {formatDateRange(order.start_date, order.end_date)}
          {order.created_at ? ` · ${formatDateTime(order.created_at)}` : ''}
        </p>
        {createdBy && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5">Оформил: {createdBy}</p>
        )}
        {allMissing.length > 0 && (
          <p className="text-[11px] text-amber-600 font-medium mt-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Не возвращено: {allMissing.join(', ')}
          </p>
        )}
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-sm text-gray-700">{formatCurrency(effectiveTotal)}</span>
          {paidRental > 0 && (
            <span className="text-[11px] text-green-600 font-medium">
              Заработано: {formatCurrency(paidRental)}
            </span>
          )}
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ORDER_STATUS_COLORS[order.status])}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
        {isActive && (
          <CloseOrderButton orderId={order.id} debt={debt} items={closeItems} variant="outline" size="sm" className="text-xs" />
        )}
      </div>
    </div>
  )
}
