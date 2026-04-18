import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/supabase/getRole'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatCurrency, formatDate, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertTriangle, TrendingUp, Camera, Users, ClipboardList, Plus } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const superAdmin = await isSuperAdmin()

  const [
    { data: stats },
    { data: topEquipment },
    { data: overdueOrders },
    { data: activeOrders },
  ] = await Promise.all([
    supabase.from('v_dashboard_stats').select('*').single(),
    supabase
      .from('v_equipment_utilization')
      .select('id, name, total_rentals, total_revenue, total_rental_days')
      .order('total_revenue', { ascending: false })
      .limit(5),
    supabase
      .from('v_overdue_orders')
      .select('*')
      .order('days_overdue', { ascending: false })
      .limit(5),
    supabase
      .from('orders')
      .select('*, clients(full_name)')
      .eq('status', 'active')
      .order('end_date')
      .limit(8),
  ])

  const s = stats as {
    active_rentals: number; overdue_count: number; revenue_this_month: number
    revenue_today: number; revenue_this_week: number; equipment_free: number; equipment_rented: number
    equipment_maintenance: number; total_clients: number
  } | null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Дашборд"
        action={
          <Link href="/orders/new">
            <Button><Plus className="w-4 h-4 mr-2" />Новый заказ</Button>
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Активных аренд"
          value={s?.active_rentals ?? 0}
          icon={<ClipboardList className="w-5 h-5 text-blue-500" />}
          href="/orders"
          color="blue"
        />
        <KpiCard
          title="Просрочено"
          value={s?.overdue_count ?? 0}
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
          href="/orders"
          color={s?.overdue_count ? 'red' : 'gray'}
        />
        <KpiCard
          title={superAdmin ? 'Доход за месяц' : 'Доход сегодня'}
          value={formatCurrency(superAdmin ? (s?.revenue_this_month ?? 0) : (s?.revenue_today ?? 0))}
          icon={<TrendingUp className="w-5 h-5 text-green-500" />}
          href="/finance"
          color="green"
        />
        <KpiCard
          title="Клиентов"
          value={s?.total_clients ?? 0}
          icon={<Users className="w-5 h-5 text-purple-500" />}
          href="/clients"
          color="purple"
        />
      </div>

      {/* Equipment status */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-semibold text-green-600">{s?.equipment_free ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">Свободно</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-semibold text-blue-600">{s?.equipment_rented ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">В аренде</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-semibold text-yellow-600">{s?.equipment_maintenance ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">На ТО</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active orders */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Активные аренды</h2>
            <Link href="/orders" className="text-xs text-blue-600 hover:underline">Все</Link>
          </div>
          {activeOrders?.length ? (
            <div className="space-y-2">
              {activeOrders.map(o => (
                <Link key={o.id} href={`/orders/${o.id}`}
                  className="flex justify-between items-center py-2 border-b last:border-0 hover:bg-gray-50 px-1 rounded">
                  <div>
                    <p className="text-sm font-medium text-blue-600">{o.order_number}</p>
                    <p className="text-xs text-gray-400">
                      {(o.clients as { full_name: string } | null)?.full_name} · до {formatDate(o.end_date)}
                    </p>
                  </div>
                  <span className="text-sm text-gray-700">{formatCurrency(o.total_amount)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-6">Активных аренд нет</p>
          )}
        </div>

        {/* Overdue */}
        {(overdueOrders?.length ?? 0) > 0 ? (
          <div className="bg-red-50 rounded-xl border border-red-200 p-5">
            <h2 className="font-semibold text-red-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Просроченные возвраты
            </h2>
            <div className="space-y-2">
              {overdueOrders!.map(o => (
                <Link key={o.id} href={`/orders/${o.id}`}
                  className="flex justify-between items-center py-2 border-b border-red-200 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-red-700">{o.order_number}</p>
                    <p className="text-xs text-red-400">
                      {o.client_name} · {o.days_overdue} дн. просрочки
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          /* Top equipment */
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Топ техника</h2>
              <Link href="/equipment" className="text-xs text-blue-600 hover:underline">Все</Link>
            </div>
            {topEquipment?.length ? (
              <div className="space-y-2">
                {topEquipment.map((e, i) => (
                  <Link key={e.id} href={`/equipment/${e.id}`}
                    className="flex justify-between items-center py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-4">{i + 1}</span>
                      <div>
                        <p className="text-sm">{e.name}</p>
                        <p className="text-xs text-gray-400">{e.total_rentals} аренд · {e.total_rental_days} дней</p>
                      </div>
                    </div>
                    <span className="text-sm text-green-700">{formatCurrency(e.total_revenue)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-6">Данных нет</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ title, value, icon, href, color }: {
  title: string; value: string | number; icon: React.ReactNode; href: string
  color: 'blue' | 'red' | 'green' | 'purple' | 'gray'
}) {
  const bg = {
    blue: 'bg-blue-50', red: 'bg-red-50', green: 'bg-green-50',
    purple: 'bg-purple-50', gray: 'bg-gray-50',
  }[color]

  return (
    <Link href={href}>
      <div className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
        <div className="flex items-center justify-between mb-2">
          <div className={cn('p-2 rounded-lg', bg)}>{icon}</div>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{title}</p>
      </div>
    </Link>
  )
}
