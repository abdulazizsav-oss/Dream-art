import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/equipment/StatusBadge'
import { formatCurrency } from '@/lib/utils'
import { Plus, Wrench, ChevronRight, Camera } from 'lucide-react'

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category: catId } = await searchParams
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('equipment_categories')
    .select('*')
    .order('name')

  if (!catId) {
    // ── Card catalog view ──────────────────────────────────────
    const { data: equipment } = await supabase
      .from('equipment')
      .select('category_id, status')

    const countsByCategory = categories?.map(cat => ({
      ...cat,
      total: equipment?.filter(e => e.category_id === cat.id).length ?? 0,
      free:  equipment?.filter(e => e.category_id === cat.id && e.status === 'free').length ?? 0,
    })) ?? []

    return (
      <div>
        <PageHeader
          title="Техника"
          description={`${equipment?.length ?? 0} единиц в базе`}
          action={
            <Link href="/equipment/new">
              <Button className="min-h-[44px] px-5">
                <Plus className="w-4 h-4 mr-2" />
                Добавить
              </Button>
            </Link>
          }
        />

        {countsByCategory.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center">
            <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Техника не добавлена</p>
            <Link href="/equipment/new" className="mt-3 inline-block">
              <Button size="sm">Добавить первую единицу</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {countsByCategory.map(cat => (
              <Link
                key={cat.id}
                href={`/equipment?category=${cat.id}`}
                className="group bg-white rounded-2xl border hover:border-blue-300 hover:shadow-md transition-all overflow-hidden"
              >
                {/* Category photo placeholder */}
                <div className="h-32 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                  <Camera className="w-10 h-10 text-blue-300 group-hover:text-blue-500 transition-colors" />
                </div>
                <div className="p-4">
                  <p className="font-semibold text-gray-900 truncate">{cat.name}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm text-gray-400">{cat.total} ед.</p>
                    <span className="text-xs text-green-600 font-medium">{cat.free} своб.</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Category drill-down view ───────────────────────────────
  const currentCat = categories?.find(c => c.id === catId)
  const { data: equipment } = await supabase
    .from('equipment')
    .select('*')
    .eq('category_id', catId)
    .order('name')

  return (
    <div>
      <PageHeader
        title={currentCat?.name ?? 'Техника'}
        description={`${equipment?.length ?? 0} единиц`}
        action={
          <div className="flex gap-2">
            <Link href="/equipment">
              <Button variant="outline" className="min-h-[44px]">
                ← Категории
              </Button>
            </Link>
            <Link href="/equipment/new">
              <Button className="min-h-[44px] px-5">
                <Plus className="w-4 h-4 mr-2" />
                Добавить
              </Button>
            </Link>
          </div>
        }
      />

      {(equipment?.length ?? 0) === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">В этой категории нет техники</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipment!.map(item => (
            <Link
              key={item.id}
              href={`/equipment/${item.id}`}
              className="group bg-white rounded-2xl border hover:border-blue-300 hover:shadow-md transition-all overflow-hidden"
            >
              {/* Item photo or placeholder */}
              <div className="h-40 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden">
                {item.photo_url ? (
                  <img
                    src={item.photo_url}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <Camera className="w-12 h-12 text-gray-200 group-hover:text-gray-300 transition-colors" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 leading-snug">{item.name}</p>
                  <StatusBadge status={item.status} />
                </div>
                {item.serial_number && (
                  <p className="text-xs text-gray-400 mt-1">S/N: {item.serial_number}</p>
                )}
                {item.notes && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.notes}</p>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="text-sm font-medium text-gray-700">
                    {formatCurrency(item.daily_rate)}<span className="text-gray-400 font-normal">/день</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
