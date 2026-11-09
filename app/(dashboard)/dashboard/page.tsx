import { createClient } from '@/lib/supabase/server'
import { loadOrderList } from '@/lib/orders/load-list'
import { matchesQueue } from '@/lib/orders/list'
import { isSuperAdmin } from '@/lib/supabase/getRole'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { AlertTriangle, TrendingUp, Camera, Users, ClipboardList, Truck } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const superAdmin = await isSuperAdmin()

  const [
    { data: stats, error: statsError },
    { data: topEquipment, error: topError },
    allOrders,
    { count: maintenanceCount, error: maintenanceError },
  ] = await Promise.all([
    supabase.from('v_dashboard_stats').select('*').single(),
    supabase
      .from('v_equipment_utilization')
      .select('id, name, total_revenue, total_rental_days')
      .order('total_revenue', { ascending: false })
      .limit(5),
    // Полный список: счётчики долга и недосдачи должны совпадать с очередями раздела «Аренда».
    loadOrderList(supabase),
    supabase.from('equipment').select('*', { count: 'exact', head: true }).eq('status', 'maintenance'),
  ])

  if (maintenanceError) throw new Error('Не удалось загрузить каталог для главной')
  const openOrders = allOrders.filter(order => matchesQueue(order, 'active'))
  const debtCount = allOrders.filter(order => matchesQueue(order, 'debt')).length
  const missingCount = allOrders.filter(order => matchesQueue(order, 'missing')).length
  const sortedOpenOrders = [...openOrders].sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''))
  const activeOrders = sortedOpenOrders.slice(0, 8)
  const allOverdue = sortedOpenOrders.filter(order => order.isOverdue)
  const overdueOrders = allOverdue.slice(0, 5)

  const s = stats as {
    active_rentals: number; overdue_count: number; revenue_this_month: number
    revenue_today: number; revenue_this_week: number; equipment_free: number; equipment_rented: number
    equipment_maintenance: number; total_clients: number
  } | null

  return (
    <div className="space-y-6">
      <PageHeader title="Главная" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Активных аренд"
          value={openOrders.length}
          icon={<ClipboardList className="w-5 h-5 text-blue-500" />}
          href="/orders"
          color="blue"
        />
        <KpiCard
          title="Просрочено"
          value={allOverdue.length}
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
          href="/orders?queue=overdue"
          color={allOverdue.length ? 'red' : 'neutral'}
        />
        {superAdmin ? (
          <KpiCard
            title="Доход за месяц"
            value={statsError ? "—" : formatCurrency(s?.revenue_this_month ?? 0)}
            icon={<TrendingUp className="w-5 h-5 text-green-500" />}
            href="/finance"
            color="green"
          />
        ) : (
          <KpiCard
            title="Каталог: статус «Свободно»"
            value={statsError ? "—" : s?.equipment_free ?? 0}
            icon={<Camera className="w-5 h-5 text-green-500" />}
            href="/equipment"
            color="green"
          />
        )}
        <KpiCard
          title="Клиентов"
          value={statsError ? "—" : s?.total_clients ?? 0}
          icon={<Users className="w-5 h-5 text-purple-500" />}
          href="/clients"
          color="purple"
        />
      </div>

      <p className="text-xs text-zinc-500">Статусы каталога не показывают свободные физические экземпляры. Наличие проверяйте перед выдачей.</p>
      {statsError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Часть показателей не загрузилась. Обновите страницу; число открытых и просроченных заказов рассчитано по списку аренды.</p>}

      {/* Что требует внимания: те же очереди, что в разделе «Аренда» */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <AttentionTile
          href="/orders?queue=debt"
          value={debtCount}
          label="С долгом"
          caption="Заказы с неоплаченным остатком"
          tone={debtCount > 0 ? 'amber' : 'neutral'}
        />
        <AttentionTile
          href="/orders?queue=missing"
          value={missingCount}
          label="Не возвращено"
          caption="Просрочка и недосдача комплекта"
          tone={missingCount > 0 ? 'orange' : 'neutral'}
        />
        <AttentionTile
          href="/equipment"
          value={maintenanceCount ?? 0}
          label="На ТО"
          caption="Позиции каталога на обслуживании"
          tone={(maintenanceCount ?? 0) > 0 ? 'yellow' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active orders */}
        <div className="bg-white rounded-2xl p-5 shadow-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Активные аренды</h2>
            <Link href="/orders" className="inline-flex min-h-11 items-center text-sm text-blue-600 hover:underline">Все ({openOrders.length})</Link>
          </div>
          {activeOrders?.length ? (
            <div className="space-y-2">
              {activeOrders.map(o => (
                <Link key={o.id} href={`/orders/${o.id}`}
                  className="flex justify-between items-center gap-3 py-2 border-b last:border-0 hover:bg-zinc-50 px-1 rounded">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium text-blue-600">{o.orderNumber}</p>
                      {o.deliveryFee > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                          <Truck className="h-3 w-3" />
                          Доставка {formatCurrency(o.deliveryFee)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">
                      {o.clientName} · до {formatDate(o.endDate!)}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-sm text-zinc-700">{formatCurrency(o.effectiveTotal)}<span className="block text-xs text-zinc-500">по факту на сейчас</span></span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-6">Активных аренд нет</p>
          )}
        </div>

        {/* Overdue */}
        {(overdueOrders?.length ?? 0) > 0 ? (
          <div className="bg-red-50 rounded-2xl border border-red-200 p-5">
            <h2 className="font-semibold text-red-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Просроченные возвраты · {overdueOrders.length} из {allOverdue.length}
            </h2>
            <Link href="/orders?queue=overdue" className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-red-800 underline">Все просрочки ({allOverdue.length})</Link>
            <div className="space-y-2">
              {overdueOrders!.map(o => (
                <Link key={o.id} href={`/orders/${o.id}`}
                  className="flex justify-between items-center py-2 border-b border-red-200 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-red-700">{o.orderNumber}</p>
                    <p className="text-xs text-red-600">
                      {o.clientName} · плановый возврат {o.endDate ? formatDate(o.endDate) : "не указан"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          /* Top equipment */
          <div className="bg-white rounded-2xl p-5 shadow-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Топ техника</h2>
              <Link href="/equipment" className="inline-flex min-h-11 items-center text-sm text-blue-600 hover:underline">Все</Link>
            </div>
            {topEquipment?.length ? (
              <div className="space-y-2">
                {topEquipment.map((e, i) => (
                  <Link key={e.id} href={`/equipment/${e.id}`}
                    className="flex justify-between items-center py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 text-xs w-4">{i + 1}</span>
                      <div>
                        <p className="text-sm">{e.name}</p>
                        <p className="text-xs text-zinc-500">{e.total_rental_days} дней в аренде</p>
                      </div>
                    </div>
                    {superAdmin && (
                      <span className="text-sm text-green-700">{formatCurrency(e.total_revenue)}</span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-6">{topError ? "Не удалось загрузить статистику техники. Обновите страницу." : "Данных нет"}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ title, value, icon, href, color }: {
  title: string; value: string | number; icon: React.ReactNode; href: string
  color: 'blue' | 'red' | 'green' | 'purple' | 'neutral'
}) {
  const bg = {
    blue: 'bg-blue-50', red: 'bg-red-50', green: 'bg-green-50',
    purple: 'bg-purple-50', neutral: 'bg-zinc-50',
  }[color]

  return (
    <Link href={href}>
      <div className="bg-white rounded-2xl p-4 shadow-border shadow-border-hover">
        <div className="flex items-center justify-between mb-2">
          <div className={cn('p-2 rounded-lg', bg)}>{icon}</div>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{title}</p>
      </div>
    </Link>
  )
}

function AttentionTile({ href, value, label, caption, tone }: {
  href: string; value: number; label: string; caption: string
  tone: 'amber' | 'orange' | 'yellow' | 'neutral'
}) {
  const valueColor = {
    amber: 'text-amber-700', orange: 'text-orange-700', yellow: 'text-yellow-700', neutral: 'text-zinc-900',
  }[tone]

  return (
    <Link href={href} className="block h-full rounded-2xl bg-white p-3 shadow-border shadow-border-hover sm:p-4">
      <p className={cn('text-2xl font-semibold tabular-nums', valueColor)}>{value}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900">{label}</p>
      <p className="mt-0.5 hidden text-xs text-zinc-500 sm:block">{caption}</p>
    </Link>
  )
}
