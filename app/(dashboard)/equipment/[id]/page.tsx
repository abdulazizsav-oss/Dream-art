import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { EquipmentForm } from '@/components/equipment/EquipmentForm'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { CalendarDays, CircleDollarSign, Layers, Moon, Package, Sun, TrendingUp } from 'lucide-react'

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('equipment')
    .select('*, equipment_categories(name, slug), equipment_maintenance(*)')
    .eq('id', id)
    .single()
  const brandId = (item as any)?.brand_id
  const { data: brandData } = brandId
    ? await supabase.from('brands').select('name').eq('id', brandId).single()
    : { data: null }

  if (!item) notFound()

  const { data: utilization } = await supabase
    .from('v_equipment_utilization')
    .select('total_rentals, total_revenue, roi_percent')
    .eq('id', id)
    .single()

  const kitItems = ((item as any).kit_items ?? []) as string[]
  const [{ data: categories }, { data: brands }] = await Promise.all([
    supabase.from('equipment_categories').select('*').order('sort_order').order('name'),
    supabase.from('brands').select('id, name, logo_url').order('sort_order').order('name'),
  ])

  // Rental history
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('*, orders(id, order_number, start_date, end_date, status, clients(full_name))')
    .eq('equipment_id', id)
    .order('id', { ascending: false })
    .limit(10)

  const maintenance = (item.equipment_maintenance as { id: string; scheduled_date: string | null; completed_date: string | null; description: string | null; cost: number | null }[]) ?? []

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={item.name}
        description={`Каталог · ${(item.equipment_categories as { name: string } | null)?.name ?? 'Без категории'}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Layers className="w-4 h-4" />
            Категория
          </div>
          <p className="font-semibold mt-1">{(item.equipment_categories as { name: string } | null)?.name ?? 'Без категории'}</p>
          {(brandData?.name ?? item.brand) && (
            <p className="text-xs text-zinc-400 mt-1">{brandData?.name ?? item.brand}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <CircleDollarSign className="w-4 h-4" />
            Ставки аренды
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {(item.equipment_categories as { slug?: string } | null)?.slug === 'cameras' ? (
              <>
                <p className="font-semibold inline-flex items-center gap-2">
                  <Sun className="w-4 h-4 text-amber-500" />
                  День: {formatCurrency((item as any).day_rate ?? item.daily_rate, item.currency)}
                </p>
                <p className="font-semibold inline-flex items-center gap-2">
                  <Moon className="w-4 h-4 text-indigo-500" />
                  Ночь: {formatCurrency((item as any).night_rate ?? item.daily_rate, item.currency)}
                </p>
              </>
            ) : (
              <p className="font-semibold inline-flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500" />
                {formatCurrency((item as any).day_rate ?? item.daily_rate, item.currency)} / день
              </p>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <CalendarDays className="w-4 h-4" />
            Источник
          </div>
          <p className="font-semibold mt-1">{item.source ?? 'Добавлено вручную'}</p>
        </div>
      </div>

      {item.specs && (
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Характеристики</p>
          <p className="font-medium mt-1 text-zinc-900">{item.specs}</p>
        </div>
      )}

      {/* Комплектация */}
      {kitItems.length > 0 && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <Package className="w-3.5 h-3.5" />
              Комплектация
            </div>
            <div className="flex flex-wrap gap-1.5">
              {kitItems.map(k => (
                <span key={k} className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ROI / Заработано */}
      {utilization && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <TrendingUp className="w-4 h-4" />
              Всего аренд
            </div>
            <p className="text-2xl font-bold mt-1">{utilization.total_rentals ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CircleDollarSign className="w-4 h-4" />
              Заработано
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {formatCurrency(utilization.total_revenue ?? 0, item.currency)}
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <TrendingUp className="w-4 h-4" />
              ROI
            </div>
            <p className={'text-2xl font-bold mt-1 ' + ((utilization.roi_percent ?? 0) >= 100 ? 'text-green-600' : 'text-gray-900')}>
              {Math.round(utilization.roi_percent ?? 0)}%
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Редактировать</h2>
        <EquipmentForm
          categories={categories ?? []}
          brands={brands ?? []}
          equipmentId={id}
          defaultValues={{
            name: item.name,
            category_id: item.category_id ?? undefined,
            brand_id: (item as any).brand_id ?? undefined,
            daily_rate: item.daily_rate,
            day_rate: (item as any).day_rate ?? item.daily_rate,
            night_rate: (item as any).night_rate ?? item.daily_rate,
            currency: item.currency,
            brand: item.brand ?? undefined,
            specs: item.specs ?? undefined,
            serial_number: item.serial_number ?? undefined,
            purchase_cost: item.purchase_cost ?? undefined,
            photo_url: item.photo_url ?? undefined,
            notes: item.notes ?? undefined,
            source: item.source ?? undefined,
            sort_order: item.sort_order,
            kit_items: kitItems,
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
