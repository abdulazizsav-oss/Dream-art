import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { EquipmentForm } from '@/components/equipment/EquipmentForm'
import { StatusBadge } from '@/components/equipment/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('equipment')
    .select('*, equipment_categories(name), equipment_maintenance(*)')
    .eq('id', id)
    .single()

  if (!item) notFound()

  const { data: categories } = await supabase.from('equipment_categories').select('*').order('name')

  // Rental history
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('*, orders(order_number, start_date, end_date, status, clients(full_name))')
    .eq('equipment_id', id)
    .order('id', { ascending: false })
    .limit(10)

  const maintenance = (item.equipment_maintenance as { id: string; scheduled_date: string | null; completed_date: string | null; description: string | null; cost: number | null }[]) ?? []

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={item.name}
        description={`Инвентарь · ${(item.equipment_categories as { name: string } | null)?.name ?? 'Без категории'}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <p className="text-xs text-gray-500">Статус</p>
          <StatusBadge status={item.status} />
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Ставка аренды</p>
          <p className="font-semibold mt-1">{formatCurrency(item.daily_rate)}/день</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Стоимость покупки</p>
          <p className="font-semibold mt-1">
            {item.purchase_cost ? formatCurrency(item.purchase_cost) : '—'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Редактировать</h2>
        <EquipmentForm
          categories={categories ?? []}
          equipmentId={id}
          defaultValues={{
            name: item.name,
            category_id: item.category_id ?? undefined,
            serial_number: item.serial_number ?? undefined,
            purchase_cost: item.purchase_cost ?? undefined,
            daily_rate: item.daily_rate,
            status: item.status,
            notes: item.notes ?? undefined,
          }}
        />
      </div>

      {/* Maintenance log */}
      {maintenance.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">История ТО</h2>
          <div className="space-y-2">
            {maintenance.map(m => (
              <div key={m.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <p>{m.description ?? 'ТО'}</p>
                  {m.scheduled_date && (
                    <p className="text-xs text-gray-400">
                      Запланировано: {formatDate(m.scheduled_date)}
                      {m.completed_date && ` · Выполнено: ${formatDate(m.completed_date)}`}
                    </p>
                  )}
                </div>
                {m.cost && <span className="text-gray-600">{formatCurrency(m.cost)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rental history */}
      {orderItems && orderItems.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">История аренд</h2>
          <div className="space-y-2">
            {orderItems.map(oi => {
              const order = oi.orders as { order_number: string; start_date: string; end_date: string; status: string; clients: { full_name: string } | null } | null
              return (
                <div key={oi.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <Link href={`/orders/${(oi.orders as { id?: string } | null)?.id ?? ''}`} className="text-blue-600 hover:underline">
                      {order?.order_number}
                    </Link>
                    <p className="text-xs text-gray-400">
                      {order?.clients?.full_name} · {order?.start_date} — {order?.end_date}
                    </p>
                  </div>
                  <span className="text-gray-600">{formatCurrency(oi.subtotal)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
