import { createClient } from '@/lib/supabase/server'
import { loadOrderList } from '@/lib/orders/load-list'
import { isSuperAdmin } from '@/lib/supabase/getRole'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatCurrency, formatDate, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertTriangle, TrendingUp, Camera, Users, ClipboardList, Plus, Truck } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const superAdmin = await isSuperAdmin()

  const [
    { data: stats, error: statsError },
    { data: topEquipment, error: topError },
    openOrders,
    { count: equipmentCount, error: equipmentError },
    { count: maintenanceCount, error: maintenanceError },
  ] = await Promise.all([
    supabase.from('v_dashboard_stats').select('*').single(),
    supabase
      .from('v_equipment_utilization')
      .select('id, name, total_revenue, total_rental_days')
      .order('total_revenue', { ascending: false })
      .limit(5),
    loadOrderList(supabase, true),
    supabase.from('equipment').select('*', { count: 'exact', head: true }),
    supabase.from('equipment').select('*', { count: 'exact', head: true }).eq('status', 'maintenance'),
  ])

  if (equipmentError || maintenanceError) throw new Error('Не удалось загрузить каталог для дашборда')
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
          color={allOverdue.length ? 'red' : 'gray'}
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
      {/* Equipment summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="bg-white rounded-xl p-4 text-center shadow-border">
          <p className="text-2xl font-semibold text-zinc-900">{equipmentCount ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">Позиции каталога</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-border">
          <p className="text-2xl font-semibold text-yellow-600">{maintenanceCount ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">На ТО</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-border">
          <p className="text-2xl font-semibold text-blue-600">{openOrders.length}</p>
          <p className="text-xs text-gray-500 mt-1">Активные заказы</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active orders */}
        <div className="bg-white rounded-xl p-5 shadow-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Активные аренды</h2>
            <Link href="/orders" className="text-xs text-blue-600 hover:underline">Все ({openOrders.length})</Link>
          </div>
          {activeOrders?.length ? (
            <div className="space-y-2">
              {activeOrders.map(o => (
                <Link key={o.id} href={`/orders/${o.id}`}
                  className="flex justify-between items-center py-2 border-b last:border-0 hover:bg-gray-50 px-1 rounded">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-blue-600">{o.orderNumber}</p>
                      {o.deliveryFee > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          <Truck className="h-3 w-3" />
                          Доставка {formatCurrency(o.deliveryFee)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {o.clientName} · до {formatDate(o.endDate!)}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-sm text-gray-700">{formatCurrency(o.effectiveTotal)}<span className="block text-xs text-gray-400">по факту на сейчас</span></span>
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
              Просроченные возвраты · {overdueOrders.length} из {allOverdue.length}
            </h2>
            <Link href="/orders?queue=overdue" className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-red-800 underline">Все просрочки ({allOverdue.length})</Link>
            <div className="space-y-2">
              {overdueOrders!.map(o => (
                <Link key={o.id} href={`/orders/${o.id}`}
                  className="flex justify-between items-center py-2 border-b border-red-200 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-red-700">{o.orderNumber}</p>
                    <p className="text-xs text-red-400">
                      {o.clientName} · плановый возврат {o.endDate ? formatDate(o.endDate) : "не указан"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          /* Top equipment */
          <div className="bg-white rounded-xl p-5 shadow-border">
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
                        <p className="text-xs text-gray-400">{e.total_rental_days} дней в аренде</p>
                      </div>
                    </div>
                    {superAdmin && (
                      <span className="text-sm text-green-700">{formatCurrency(e.total_revenue)}</span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-6">{topError ? "Не удалось загрузить статистику техники. Обновите страницу." : "Данных нет"}</p>
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
      <div className="bg-white rounded-xl p-4 shadow-border shadow-border-hover">
        <div className="flex items-center justify-between mb-2">
          <div className={cn('p-2 rounded-lg', bg)}>{icon}</div>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{title}</p>
      </div>
    </Link>
  )
}
